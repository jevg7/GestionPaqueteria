using Microsoft.EntityFrameworkCore;
using Paqueteria.Api.Data;

namespace Paqueteria.IntegrationTests.Infrastructure;

/// <summary>Una BD temporal del servidor de pruebas. Se elimina al liberarla.</summary>
public sealed class BaseDeDatosDePrueba(ServidorPostgres servidor, string nombre) : IAsyncDisposable
{
    /// <summary>Agencia de seed.sql ("Agencia de ejemplo"): la primera creada en una BD nueva.</summary>
    public const long AgenciaDeEjemplo = 1;

    public string Nombre { get; } = nombre;

    /// <summary>Dueño del esquema: migraciones y scripts de database/. No pasa por RLS.</summary>
    public string ConexionDueno { get; } = servidor.CadenaDeConexion(nombre, comoApi: false);

    /// <summary>
    /// Usuario de la API (miembro de paqueteria_api) sin agencia en la sesión: la usa la API real, que
    /// fija la agencia de cada solicitud. Si olvida hacerlo, las consultas fallan (42501).
    /// </summary>
    public string ConexionApi { get; } = servidor.CadenaDeConexion(nombre, comoApi: true);

    /// <summary>Usuario de la API con la agencia fija en la sesión: para preparar datos con EF directo.</summary>
    public string ConexionApiDeAgencia(long agenciaId = AgenciaDeEjemplo) =>
        servidor.CadenaDeConexion(Nombre, comoApi: true, agenciaId);

    public PaqueteriaDbContext CrearContextoApi(long agenciaId = AgenciaDeEjemplo) =>
        CrearContexto(ConexionApiDeAgencia(agenciaId));

    public PaqueteriaDbContext CrearContextoDueno() => CrearContexto(ConexionDueno);

    public async ValueTask DisposeAsync() => await servidor.EliminarAsync(Nombre);

    private static PaqueteriaDbContext CrearContexto(string connectionString)
    {
        var options = new DbContextOptionsBuilder<PaqueteriaDbContext>();
        PaqueteriaDbContext.Configurar(options, connectionString);
        return new PaqueteriaDbContext(options.Options);
    }
}
