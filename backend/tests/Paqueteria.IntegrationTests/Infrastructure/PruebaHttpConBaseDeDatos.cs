using Microsoft.EntityFrameworkCore;
using Paqueteria.Api.Entities;

namespace Paqueteria.IntegrationTests.Infrastructure;

/// <summary>
/// Tests HTTP contra la API real y una BD propia por test: crea empleados con roles y
/// clientes HTTP autenticados con tokens de <see cref="TokensDePrueba"/>.
/// </summary>
public abstract class PruebaHttpConBaseDeDatos(ServidorPostgres servidor) : PruebaConBaseDeDatos(servidor)
{
    private ApiDePrueba? api;

    protected ApiDePrueba Api => api ??= new ApiDePrueba(connection: BaseDeDatos.ConexionApi);

    public override async ValueTask DisposeAsync()
    {
        if (api is not null)
        {
            await api.DisposeAsync();
        }
        await base.DisposeAsync();
    }

    /// <summary>Cliente HTTP de un empleado activo con esos roles.</summary>
    protected async Task<HttpClient> ComoAsync(params string[] roles)
    {
        var (_, authUserId) = await CrearEmpleadoAsync(roles: roles);
        return Api.Client(TokensDePrueba.Crear(authUserId));
    }

    /// <summary>Cliente HTTP de un empleado activo de otra agencia.</summary>
    protected async Task<HttpClient> ComoEnAgenciaAsync(long agenciaId, params string[] roles)
    {
        var (_, authUserId) = await CrearEmpleadoAsync(roles: roles, agenciaId: agenciaId);
        return Api.Client(TokensDePrueba.Crear(authUserId));
    }

    protected async Task<(Usuario Usuario, Guid AuthUserId)> CrearEmpleadoAsync(
        bool activo = true, string[]? roles = null, long agenciaId = BaseDeDatosDePrueba.AgenciaDeEjemplo)
    {
        await using var db = BaseDeDatos.CrearContextoApi(agenciaId);
        var authUserId = Guid.NewGuid();
        var usuario = await CrearUsuarioAsync(db);
        usuario.AuthUserId = authUserId;
        usuario.Activo = activo;
        foreach (var codigo in roles ?? [])
        {
            var rolId = await db.Roles.Where(r => r.Codigo == codigo).Select(r => r.Id).SingleAsync(Ct);
            db.UsuarioRoles.Add(new UsuarioRol { UsuarioId = usuario.Id, RolId = rolId });
        }
        await db.SaveChangesAsync(Ct);
        return (usuario, authUserId);
    }

    /// <summary>Otra agencia en la misma BD, sin datos: la de seed.sql es la 1.</summary>
    protected async Task<long> CrearAgenciaAsync(string nombre, EstadoAgencia estado = EstadoAgencia.Activa)
    {
        await using var db = NuevoContexto();
        var agencia = new Agencia { Nombre = nombre, Estado = estado };
        db.Agencias.Add(agencia);
        await db.SaveChangesAsync(Ct);
        return agencia.Id;
    }
}
