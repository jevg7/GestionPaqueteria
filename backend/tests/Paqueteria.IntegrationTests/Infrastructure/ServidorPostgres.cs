using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Paqueteria.IntegrationTests.Infrastructure;
using Testcontainers.PostgreSql;

[assembly: AssemblyFixture(typeof(ServidorPostgres))]

namespace Paqueteria.IntegrationTests.Infrastructure;

/// <summary>
/// Un PostgreSQL 16 en Docker para toda la ejecución de los tests, configurado como Supabase:
/// las migraciones corren con un dueño que <b>no</b> es superusuario y la API se conecta con
/// un usuario de login miembro de <c>paqueteria_api</c>. Las contraseñas se generan en cada
/// ejecución; no hay secretos en el repositorio.
/// </summary>
public sealed class ServidorPostgres : IAsyncLifetime
{
    /// <summary>Versión con la que se probó schema.sql.</summary>
    private const string Imagen = "postgres:16";

    /// <summary>Hace el papel de "postgres" en Supabase: dueño del esquema, con CREATEROLE.</summary>
    public const string RolDueno = "paqueteria_owner";

    /// <summary>Usuario de login de la API (miembro de paqueteria_api).</summary>
    public const string RolApi = "paqueteria_api_app";

    private const string BaseDePlantilla = "paqueteria_plantilla";

    private readonly PostgreSqlContainer contenedor = new PostgreSqlBuilder(Imagen).Build();
    private readonly string claveDueno = GenerarClave();
    private readonly string claveApi = GenerarClave();

    // CREATE DATABASE desde la plantilla y la migración (GRANT de roles) no deben correr en paralelo.
    private readonly SemaphoreSlim cerrojo = new(1, 1);

    public async ValueTask InitializeAsync()
    {
        await contenedor.StartAsync();

        await EjecutarComoSuperusuarioAsync($"""
            create role {RolDueno} login createrole password '{claveDueno}';
            create role {RolApi} login password '{claveApi}';
            alter role {RolApi} set search_path = paqueteria, public;
            """);

        // Plantilla: BD migrada y con seed.sql. Cada test recibe una copia (CREATE DATABASE … TEMPLATE),
        // mucho más rápido que migrar cada vez. La primera migración crea el rol paqueteria_api.
        var plantilla = await CrearBaseVaciaAsync(BaseDePlantilla);
        await MigrarAsync(plantilla);
        await EjecutarScriptAsync(plantilla.ConexionDueno, ScriptsSql.Seed);
        await EjecutarComoSuperusuarioAsync($"grant paqueteria_api to {RolApi};");

        // Una BD con conexiones abiertas no puede usarse como plantilla.
        NpgsqlConnection.ClearAllPools();
    }

    public async ValueTask DisposeAsync() => await contenedor.DisposeAsync();

    /// <summary>BD nueva sin esquema (ni historial de migraciones).</summary>
    public async Task<BaseDeDatosDePrueba> CrearBaseVaciaAsync(string? nombre = null)
    {
        nombre ??= NombreNuevo();
        await EjecutarComoSuperusuarioAsync($"create database {nombre} owner {RolDueno};");
        return new BaseDeDatosDePrueba(this, nombre);
    }

    /// <summary>BD nueva con el esquema migrado y seed.sql, sin datos de otros tests.</summary>
    public async Task<BaseDeDatosDePrueba> CrearBaseMigradaAsync()
    {
        var nombre = NombreNuevo();
        await cerrojo.WaitAsync();
        try
        {
            await EjecutarComoSuperusuarioAsync($"create database {nombre} owner {RolDueno} template {BaseDePlantilla};");
        }
        finally
        {
            cerrojo.Release();
        }
        return new BaseDeDatosDePrueba(this, nombre);
    }

    /// <summary>Aplica las migraciones con el dueño del esquema, como en el despliegue.</summary>
    public async Task MigrarAsync(BaseDeDatosDePrueba baseDeDatos)
    {
        await cerrojo.WaitAsync();
        try
        {
            await using var db = baseDeDatos.CrearContextoDueno();
            await db.Database.MigrateAsync();
        }
        finally
        {
            cerrojo.Release();
        }
    }

    public Task EliminarAsync(string nombre) =>
        EjecutarComoSuperusuarioAsync($"drop database if exists {nombre} with (force);");

    /// <summary>
    /// Ejecuta un script SQL completo (varias sentencias, bloques DO) sin psql y devuelve
    /// los mensajes NOTICE que emitió, en orden.
    /// </summary>
    public static async Task<IReadOnlyList<string>> EjecutarScriptAsync(string connectionString, string sql)
    {
        var avisos = new List<string>();
        await using var conexion = new NpgsqlConnection(connectionString);
        conexion.Notice += (_, e) => avisos.Add(e.Notice.MessageText);
        await conexion.OpenAsync();
        await using var comando = new NpgsqlCommand(sql, conexion) { CommandTimeout = 120 };
        await comando.ExecuteNonQueryAsync();
        return avisos;
    }

    /// <param name="agenciaId">
    /// Si se indica, la conexión nace con esa agencia en la sesión (opción de arranque -c): para que los
    /// tests preparen datos con EF directo. La API real nunca la usa: fija la agencia por solicitud.
    /// </param>
    internal string CadenaDeConexion(string baseDeDatos, bool comoApi, long? agenciaId = null)
    {
        var builder = new NpgsqlConnectionStringBuilder(contenedor.GetConnectionString())
        {
            Database = baseDeDatos,
            Username = comoApi ? RolApi : RolDueno,
            Password = comoApi ? claveApi : claveDueno,
            IncludeErrorDetail = true,
        };
        if (agenciaId is { } agencia)
        {
            builder.Options = $"-c paqueteria.agencia_id={agencia}";
        }
        return builder.ConnectionString;
    }

    private async Task EjecutarComoSuperusuarioAsync(string sql)
    {
        await using var conexion = new NpgsqlConnection(contenedor.GetConnectionString());
        await conexion.OpenAsync();
        await using var comando = new NpgsqlCommand(sql, conexion);
        await comando.ExecuteNonQueryAsync();
    }

    private static string NombreNuevo() => $"paqueteria_test_{Guid.NewGuid():N}";

    private static string GenerarClave() => Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(24));
}
