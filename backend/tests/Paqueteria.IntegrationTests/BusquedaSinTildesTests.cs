using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;
using Paqueteria.Api.Data;
using Paqueteria.Api.Services;
using Paqueteria.IntegrationTests.Infrastructure;

namespace Paqueteria.IntegrationTests;

/// <summary>
/// Migración BusquedaSinTildes: unaccent, sus funciones y el índice de trigramas del nombre sin tildes. Que la búsqueda
/// encuentre "López" con "lopez" lo prueban ClientesTests y UsuariosTests.
/// </summary>
public class BusquedaSinTildesTests(ServidorPostgres servidor)
{
    private const string MigracionAnterior = "20260930001535_Baseline";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task ElIndiceSirveALaCondicionDelNombreTalComoLaTraduceEF()
    {
        await using var baseDeDatos = await servidor.CrearBaseMigradaAsync();
        string sql;
        await using (var db = baseDeDatos.CrearContextoDueno())
        {
            // La condición de ClientesService, con el término como constante para poder ejecutar el SQL que genera EF.
            sql = db.Clientes
                .Where(c => EF.Functions.ILike(
                    PaqueteriaDbContext.SinTildes(c.Nombres + " " + c.Apellidos),
                    PaqueteriaDbContext.PatronContieneSinTildes("lopez"),
                    Busqueda.Escape))
                .Select(c => c.Id)
                .ToQueryString();
        }

        // Con la tabla vacía PostgreSQL prefiere recorrerla: sin esa opción se ve si el índice sirve para la condición.
        var plan = await ConsultarAsync(baseDeDatos.ConexionDueno, $"set enable_seqscan = off; explain {sql}");

        Assert.Contains(plan, linea => linea.Contains("ix_clientes_nombre_sin_tildes_trgm"));
    }

    [Theory]
    [InlineData("María Peña", "%Maria Pena%")]
    [InlineData(@"50%_a\b", @"%50\%\_a\\b%")] // % _ \ literales, como Busqueda.PatronContiene
    [InlineData("％＿＼", @"%\%\_\\%")]        // unaccent los convierte en % _ \: se escapan después
    public async Task ElPatronEscapaDespuesDeQuitarLasTildes(string texto, string esperado)
    {
        await using var baseDeDatos = await servidor.CrearBaseMigradaAsync();

        var patron = await ConsultarAsync(baseDeDatos.ConexionApi,
            "select paqueteria.fn_patron_contiene_sin_tildes(@texto)", new NpgsqlParameter("texto", texto));

        Assert.Equal([esperado], patron);
        if (texto.All(char.IsAscii))
        {
            Assert.Equal(Busqueda.PatronContiene(texto), esperado);
        }
    }

    [Fact]
    public async Task EnSupabaseUnaccentQuedaEnElEsquemaExtensionsYLaApiLaUsaSinVerlo()
    {
        await using var baseDeDatos = await servidor.CrearBaseVaciaAsync();
        await ServidorPostgres.EjecutarScriptAsync(baseDeDatos.ConexionDueno, "create schema extensions;");

        await servidor.MigrarAsync(baseDeDatos);

        Assert.Equal(["extensions"], await ConsultarAsync(baseDeDatos.ConexionDueno,
            "select extnamespace::regnamespace::text from pg_extension where extname = 'unaccent'"));
        // El usuario de la API no tiene extensions en su search_path ni permiso de uso sobre ese esquema.
        Assert.Equal(["%Maria Pena Lopez%"], await ConsultarAsync(baseDeDatos.ConexionApi,
            "select paqueteria.fn_patron_contiene_sin_tildes('María Peña López')"));
    }

    [Fact]
    public async Task SeRevierteAlIndiceAnteriorYSeVuelveAAplicar()
    {
        await using var baseDeDatos = await servidor.CrearBaseMigradaAsync();

        await using (var db = baseDeDatos.CrearContextoDueno())
        {
            await db.GetService<IMigrator>().MigrateAsync(MigracionAnterior, Ct);
        }
        Assert.Equal(["ix_clientes_nombre_trgm"], await IndicesDeNombreAsync(baseDeDatos));
        Assert.Equal(["0"], await ConsultarAsync(baseDeDatos.ConexionDueno,
            "select count(*)::text from pg_proc where proname in ('fn_sin_tildes', 'fn_patron_contiene_sin_tildes')"));

        await servidor.MigrarAsync(baseDeDatos);
        Assert.Equal(["ix_clientes_nombre_sin_tildes_trgm"], await IndicesDeNombreAsync(baseDeDatos));
    }

    private static Task<List<string>> IndicesDeNombreAsync(BaseDeDatosDePrueba baseDeDatos) =>
        ConsultarAsync(baseDeDatos.ConexionDueno,
            "select indexname from pg_indexes where schemaname = 'paqueteria' and indexname like 'ix_clientes_nombre%'");

    /// <summary>Primera columna de cada fila del último resultado, como texto.</summary>
    private static async Task<List<string>> ConsultarAsync(string connectionString, string sql, params NpgsqlParameter[] parametros)
    {
        await using var conexion = new NpgsqlConnection(connectionString);
        await conexion.OpenAsync(Ct);
        await using var comando = new NpgsqlCommand(sql, conexion);
        comando.Parameters.AddRange(parametros);
        await using var lector = await comando.ExecuteReaderAsync(Ct);
        var filas = new List<string>();
        do
        {
            filas.Clear();
            while (await lector.ReadAsync(Ct))
            {
                filas.Add(lector.GetString(0));
            }
        } while (await lector.NextResultAsync(Ct));
        return filas;
    }
}
