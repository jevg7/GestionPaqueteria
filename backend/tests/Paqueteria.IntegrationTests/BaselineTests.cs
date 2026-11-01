using Microsoft.EntityFrameworkCore;
using Npgsql;
using Paqueteria.Api.Data;
using Paqueteria.Api.Data.Sql;
using Paqueteria.IntegrationTests.Infrastructure;

namespace Paqueteria.IntegrationTests;

/// <summary>La migración Baseline crea exactamente el esquema de database/schema.sql.</summary>
public class BaselineTests(ServidorPostgres servidor)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task MigrarBaseVacia_FlujoCompletoSqlPasa()
    {
        await using var baseDeDatos = await servidor.CrearBaseVaciaAsync();

        await servidor.MigrarAsync(baseDeDatos);

        await using (var db = baseDeDatos.CrearContextoDueno())
        {
            Assert.Equal(db.Database.GetMigrations(), await db.Database.GetAppliedMigrationsAsync(Ct));
            Assert.Empty(await db.Database.GetPendingMigrationsAsync(Ct));
        }

        await ServidorPostgres.EjecutarScriptAsync(baseDeDatos.ConexionDueno, ScriptsSql.Seed);
        var avisos = await ServidorPostgres.EjecutarScriptAsync(baseDeDatos.ConexionDueno, ScriptsSql.FlujoCompleto);

        foreach (var aviso in avisos)
        {
            TestContext.Current.TestOutputHelper?.WriteLine(aviso);
        }
        Assert.Equal("=== TODAS LAS PRUEBAS PASARON ===", avisos[^1]);
    }

    [Fact]
    public void ModeloNoTieneCambiosPendientes()
    {
        // No se conecta: compara el modelo con el snapshot de la última migración.
        var options = new DbContextOptionsBuilder<PaqueteriaDbContext>();
        PaqueteriaDbContext.Configurar(options, connectionString: null);
        using var db = new PaqueteriaDbContext(options.Options);

        Assert.False(db.Database.HasPendingModelChanges());
    }

    [Fact]
    public void SchemaSqlSigueCongelado()
    {
        // Si falla: schema.sql cambió. Los cambios de esquema van en una migración nueva.
        var hashActual = EsquemaBaseline.CalcularSha256(EsquemaBaseline.LeerSinVerificar());

        Assert.Equal(EsquemaBaseline.Sha256Congelado, hashActual);
    }

    [Fact]
    public async Task UsuarioDeLaApiNoAccedeAlHistorialDeMigraciones()
    {
        await using var baseDeDatos = await servidor.CrearBaseMigradaAsync();
        await using var conexion = new NpgsqlConnection(baseDeDatos.ConexionDueno);
        await conexion.OpenAsync(Ct);
        await using var comando = new NpgsqlCommand(
            $"""
            select has_table_privilege('paqueteria_api', 'paqueteria."{PaqueteriaDbContext.TablaHistorialMigraciones}"',
                                       'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
            """,
            conexion);

        var tieneAcceso = (bool)(await comando.ExecuteScalarAsync(Ct))!;

        Assert.False(tieneAcceso);
    }
}
