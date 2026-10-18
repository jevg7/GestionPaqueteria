using Microsoft.EntityFrameworkCore;
using Paqueteria.Api.Data;
using Paqueteria.Api.Entities;

namespace Paqueteria.IntegrationTests.Infrastructure;

/// <summary>
/// Base de los tests que usan EF: cada test recibe su propia BD migrada y con seed.sql
/// (copia de la plantilla), así los correlativos empiezan en cero y no hay interferencias.
/// </summary>
public abstract class PruebaConBaseDeDatos(ServidorPostgres servidor) : IAsyncLifetime
{
    private BaseDeDatosDePrueba? baseDeDatos;

    protected BaseDeDatosDePrueba BaseDeDatos =>
        baseDeDatos ?? throw new InvalidOperationException("La BD del test aún no se creó.");

    protected static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => baseDeDatos = await servidor.CrearBaseMigradaAsync();

    public virtual async ValueTask DisposeAsync()
    {
        if (baseDeDatos is not null)
        {
            await baseDeDatos.DisposeAsync();
        }
    }

    /// <summary>Contexto con el usuario de la API: los tests comprueban también sus permisos.</summary>
    protected PaqueteriaDbContext NuevoContexto() => BaseDeDatos.CrearContextoApi();

    protected static async Task<Usuario> CrearUsuarioAsync(PaqueteriaDbContext db)
    {
        var usuario = new Usuario
        {
            Nombres = "Bruno",
            Apellidos = "Bodega",
            Correo = $"bruno.{Guid.NewGuid():N}@test.local",
        };
        db.Usuarios.Add(usuario);
        await db.SaveChangesAsync(Ct);
        return usuario;
    }

    protected static async Task<Cliente> CrearClienteAsync(PaqueteriaDbContext db)
    {
        var cliente = new Cliente { Nombres = "María", Apellidos = "López", Telefono = "+505 8888 0001" };
        db.Clientes.Add(cliente);
        await db.SaveChangesAsync(Ct);
        return cliente;
    }

    protected static async Task<Paquete> CrearPaqueteAereoAsync(PaqueteriaDbContext db, Cliente cliente, Usuario usuario)
    {
        var paquete = new Paquete
        {
            ClienteId = cliente.Id,
            TrackingExterno = $"TBA{Random.Shared.NextInt64(1_000_000_000, 9_999_999_999)}",
            Tienda = "Amazon",
            Descripcion = "Audífonos",
            MetodoEnvioId = await IdMetodoAsync(db, "AEREO"),
            RegistradoPorUsuarioId = usuario.Id,
        };
        db.Paquetes.Add(paquete);
        await db.SaveChangesAsync(Ct);
        return paquete;
    }

    protected static Task<short> IdMetodoAsync(PaqueteriaDbContext db, string codigo) =>
        db.MetodosEnvio.Where(m => m.Codigo == codigo).Select(m => m.Id).SingleAsync(Ct);
}
