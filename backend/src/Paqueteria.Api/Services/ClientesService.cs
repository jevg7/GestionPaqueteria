using System.Linq.Expressions;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Paqueteria.Api.Auth;
using Paqueteria.Api.Data;
using Paqueteria.Api.DTOs;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.Services;

/// <summary>
/// Registro, búsqueda y activación de clientes. No hay borrado: un cliente se desactiva, lo que
/// solo impide registrarle paquetes nuevos; sus paquetes en curso siguen su flujo.
/// </summary>
public sealed class ClientesService(PaqueteriaDbContext db, UsuarioActual usuarioActual, ILogger<ClientesService> logger)
{
    private static readonly Expression<Func<Cliente, ClientResponse>> AResponse = c => new ClientResponse(
        c.Id, c.CodigoCliente, c.Nombres, c.Apellidos, c.Telefono, c.Correo, c.Direccion,
        c.Activo, c.FechaRegistro, c.ActualizadoEn);

    private static readonly Func<Cliente, ClientResponse> AResponseCompilado = AResponse.Compile();

    public async Task<PagedResponse<ClientResponse>> BuscarAsync(ClientSearchQuery filtro, CancellationToken cancellationToken)
    {
        var consulta = db.Clientes.AsNoTracking();

        if (filtro.Activo is { } activo)
        {
            consulta = consulta.Where(c => c.Activo == activo);
        }

        var termino = filtro.Search?.Trim();
        if (!string.IsNullOrEmpty(termino))
        {
            var patron = Busqueda.PatronContiene(termino);
            var digitos = Regex.Replace(termino, "[^0-9]", "");

            // El nombre se compara sin tildes por ambos lados ("lopez" encuentra "López" y "rúiz" a "Ruiz").
            // fn_sin_tildes(nombres || ' ' || apellidos) es la expresión del índice ix_clientes_nombre_sin_tildes_trgm,
            // que sirve a esta condición sola; con los OR (código, correo, teléfono) se recorren los de la agencia.
            // El teléfono se compara solo por dígitos: "8888-0001" encuentra "+505 8888 0001".
            consulta = digitos.Length >= 4
                ? consulta.Where(c =>
                    EF.Functions.ILike(PaqueteriaDbContext.SinTildes(c.Nombres + " " + c.Apellidos), PaqueteriaDbContext.PatronContieneSinTildes(termino), Busqueda.Escape) ||
                    EF.Functions.ILike(c.CodigoCliente, patron, Busqueda.Escape) ||
                    EF.Functions.ILike(c.Correo!, patron, Busqueda.Escape) ||
                    // Replace encadenados (los caracteres que admite la validación): Npgsql traduce
                    // Regex.Replace a regexp_replace sin el flag 'g' y solo quitaría el primero.
                    c.Telefono.Replace(" ", "").Replace("-", "").Replace("(", "").Replace(")", "").Replace("+", "")
                        .Contains(digitos))
                : consulta.Where(c =>
                    EF.Functions.ILike(PaqueteriaDbContext.SinTildes(c.Nombres + " " + c.Apellidos), PaqueteriaDbContext.PatronContieneSinTildes(termino), Busqueda.Escape) ||
                    EF.Functions.ILike(c.CodigoCliente, patron, Busqueda.Escape) ||
                    EF.Functions.ILike(c.Correo!, patron, Busqueda.Escape));
        }

        var total = await consulta.CountAsync(cancellationToken);
        var items = await consulta
            .OrderBy(c => c.Apellidos).ThenBy(c => c.Nombres).ThenBy(c => c.Id)
            .Skip((filtro.Page - 1) * filtro.PageSize)
            .Take(filtro.PageSize)
            .Select(AResponse)
            .ToListAsync(cancellationToken);

        return new PagedResponse<ClientResponse>(items, filtro.Page, filtro.PageSize, total);
    }

    public Task<ClientResponse?> ObtenerAsync(long id, CancellationToken cancellationToken) =>
        db.Clientes.AsNoTracking().Where(c => c.Id == id).Select(AResponse).SingleOrDefaultAsync(cancellationToken);

    public async Task<ClientResponse> CrearAsync(ClientRequest datos, CancellationToken cancellationToken)
    {
        var cliente = new Cliente();
        Aplicar(cliente, datos);
        db.Clientes.Add(cliente);
        await db.SaveChangesAsync(cancellationToken);

        // Sin tabla de auditoría todavía: queda en el log quién lo registró (sin datos personales).
        logger.LogInformation("Cliente {ClienteId} ({Codigo}) registrado por el usuario {UsuarioId}.",
            cliente.Id, cliente.CodigoCliente, usuarioActual.Id);
        return AResponseCompilado(cliente);
    }

    /// <summary>Reemplaza los datos del cliente. Gana la última escritura. Null si no existe.</summary>
    public async Task<ClientResponse?> ActualizarAsync(long id, ClientRequest datos, CancellationToken cancellationToken)
    {
        var cliente = await db.Clientes.SingleOrDefaultAsync(c => c.Id == id, cancellationToken);
        if (cliente is null)
        {
            return null;
        }

        Aplicar(cliente, datos);
        await db.SaveChangesAsync(cancellationToken);

        logger.LogInformation("Cliente {ClienteId} actualizado por el usuario {UsuarioId}.", cliente.Id, usuarioActual.Id);
        return AResponseCompilado(cliente);
    }

    /// <summary>Activa o desactiva. Es idempotente. False si el cliente no existe.</summary>
    public async Task<bool> CambiarActivoAsync(long id, bool activo, CancellationToken cancellationToken)
    {
        var cliente = await db.Clientes.SingleOrDefaultAsync(c => c.Id == id, cancellationToken);
        if (cliente is null)
        {
            return false;
        }

        if (cliente.Activo != activo)
        {
            cliente.Activo = activo;
            await db.SaveChangesAsync(cancellationToken);
            logger.LogInformation("Cliente {ClienteId} {Accion} por el usuario {UsuarioId}.",
                cliente.Id, activo ? "reactivado" : "desactivado", usuarioActual.Id);
        }
        return true;
    }

    private static void Aplicar(Cliente cliente, ClientRequest datos)
    {
        cliente.Nombres = datos.Nombres.Trim();
        cliente.Apellidos = datos.Apellidos.Trim();
        cliente.Telefono = datos.Telefono.Trim();
        cliente.Correo = Opcional(datos.Correo);
        cliente.Direccion = Opcional(datos.Direccion);
    }

    private static string? Opcional(string? valor) => string.IsNullOrWhiteSpace(valor) ? null : valor.Trim();
}
