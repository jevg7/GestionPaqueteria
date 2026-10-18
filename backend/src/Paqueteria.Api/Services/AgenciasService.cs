using System.Globalization;
using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Paqueteria.Api.Auth;
using Paqueteria.Api.Data;
using Paqueteria.Api.DTOs;
using Paqueteria.Api.Entities;
using Paqueteria.Api.Middleware;

namespace Paqueteria.Api.Services;

/// <summary>
/// Agencias de la plataforma, administradas por su dueño. Suspender una agencia deja a todos sus
/// usuarios sin acceso (403) desde su siguiente solicitud, sin tocar sus datos. No hay borrado.
/// El dueño no ve datos de negocio: solo los de esta tabla.
/// </summary>
public sealed class AgenciasService(
    PaqueteriaDbContext db, UsuarioActual usuarioActual, UsuariosService usuarios, ILogger<AgenciasService> logger)
{
    private static readonly Expression<Func<Agencia, AgencyResponse>> AResponse = a => new AgencyResponse(
        a.Id, a.Nombre, a.Ruc, a.CorreoContacto, a.Telefono, a.Estado, a.CreadoEn, a.ActualizadoEn);

    public async Task<PagedResponse<AgencyResponse>> BuscarAsync(AgencySearchQuery filtro, CancellationToken cancellationToken)
    {
        var consulta = db.Agencias.AsNoTracking();
        if (filtro.Estado is { } estado)
        {
            consulta = consulta.Where(a => a.Estado == estado);
        }
        var termino = filtro.Search?.Trim();
        if (!string.IsNullOrEmpty(termino))
        {
            var patron = Busqueda.PatronContiene(termino);
            consulta = consulta.Where(a =>
                EF.Functions.ILike(a.Nombre, patron, Busqueda.Escape) ||
                EF.Functions.ILike(a.Ruc!, patron, Busqueda.Escape) ||
                EF.Functions.ILike(a.CorreoContacto!, patron, Busqueda.Escape));
        }

        var total = await consulta.CountAsync(cancellationToken);
        var items = await consulta
            .OrderBy(a => a.Nombre).ThenBy(a => a.Id)
            .Skip((filtro.Page - 1) * filtro.PageSize)
            .Take(filtro.PageSize)
            .Select(AResponse)
            .ToListAsync(cancellationToken);
        return new PagedResponse<AgencyResponse>(items, filtro.Page, filtro.PageSize, total);
    }

    public Task<AgencyResponse?> ObtenerAsync(long id, CancellationToken cancellationToken) =>
        db.Agencias.AsNoTracking().Where(a => a.Id == id).Select(AResponse).SingleOrDefaultAsync(cancellationToken);

    /// <summary>
    /// Crea la agencia con su configuración inicial y su primer ADMIN, e invita a este por correo. Todo en
    /// una transacción: si la invitación falla, no queda nada creado.
    /// </summary>
    public async Task<AgencyResponse> CrearAsync(CreateAgencyRequest datos, CancellationToken cancellationToken)
    {
        await using var transaccion = await db.Database.BeginTransactionAsync(cancellationToken);
        var agencia = new Agencia();
        Aplicar(agencia, datos.Agencia);
        db.Agencias.Add(agencia);
        await GuardarAsync(cancellationToken);

        // Lo que sigue pertenece a la agencia nueva (DEFAULT agencia_id y RLS). is_local = true: vale
        // solo hasta el fin de la transacción.
        await db.Database.ExecuteSqlAsync(
            $"select set_config('paqueteria.agencia_id', {agencia.Id.ToString(CultureInfo.InvariantCulture)}, true)",
            cancellationToken);

        var miami = new Ubicacion { Codigo = "MIA", Nombre = "Bodega Miami", Pais = "US" };
        var managua = new Ubicacion { Codigo = "MGA", Nombre = "Agencia Managua", Pais = "NI" };
        db.Ubicaciones.AddRange(miami, managua);
        await db.SaveChangesAsync(cancellationToken);
        db.Rutas.Add(new Ruta { OrigenId = miami.Id, DestinoId = managua.Id, Nombre = "Miami → Managua" });
        await db.SaveChangesAsync(cancellationToken);

        var admin = datos.Admin;
        var usuario = await usuarios.AltaConInvitacionAsync(
            new CreateUserRequest(admin.Nombres, admin.Apellidos, admin.Correo, admin.Telefono, [CodigosRol.Admin]),
            cancellationToken);
        await transaccion.CommitAsync(cancellationToken);

        logger.LogInformation("Agencia {AgenciaId} creada por el dueño de la plataforma {PlataformaId}; ADMIN invitado: usuario {UsuarioId}.",
            agencia.Id, usuarioActual.PlataformaId, usuario.Id);
        return (await ObtenerAsync(agencia.Id, cancellationToken))!;
    }

    /// <summary>Reemplaza nombre, RUC y contacto. Null si no existe.</summary>
    public async Task<AgencyResponse?> ActualizarAsync(long id, AgencyRequest datos, CancellationToken cancellationToken)
    {
        var agencia = await db.Agencias.SingleOrDefaultAsync(a => a.Id == id, cancellationToken);
        if (agencia is null)
        {
            return null;
        }
        Aplicar(agencia, datos);
        await GuardarAsync(cancellationToken);
        logger.LogInformation("Agencia {AgenciaId} actualizada por el dueño de la plataforma {PlataformaId}.",
            agencia.Id, usuarioActual.PlataformaId);
        return await ObtenerAsync(agencia.Id, cancellationToken);
    }

    /// <summary>Suspende o reactiva. Es idempotente. False si no existe.</summary>
    public async Task<bool> CambiarEstadoAsync(long id, EstadoAgencia estado, CancellationToken cancellationToken)
    {
        var agencia = await db.Agencias.SingleOrDefaultAsync(a => a.Id == id, cancellationToken);
        if (agencia is null)
        {
            return false;
        }
        if (agencia.Estado != estado)
        {
            agencia.Estado = estado;
            await db.SaveChangesAsync(cancellationToken);
            logger.LogWarning("Agencia {AgenciaId} {Accion} por el dueño de la plataforma {PlataformaId}.",
                agencia.Id, estado == EstadoAgencia.Suspendida ? "suspendida" : "reactivada", usuarioActual.PlataformaId);
        }
        return true;
    }

    private static void Aplicar(Agencia agencia, AgencyRequest datos)
    {
        agencia.Nombre = datos.Nombre.Trim();
        agencia.Ruc = Opcional(datos.Ruc);
        agencia.CorreoContacto = Opcional(datos.CorreoContacto)?.ToLowerInvariant();
        agencia.Telefono = Opcional(datos.Telefono);
    }

    private async Task GuardarAsync(CancellationToken cancellationToken)
    {
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (PostgresExceptionMapper.Find(ex) is
            { SqlState: PostgresErrorCodes.UniqueViolation, ConstraintName: "uq_agencias_nombre" })
        {
            throw new ConflictoException("Ya existe una agencia con ese nombre.");
        }
    }

    private static string? Opcional(string? valor) => string.IsNullOrWhiteSpace(valor) ? null : valor.Trim();
}
