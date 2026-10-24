using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;
using Paqueteria.Api.Data;
using Paqueteria.IntegrationTests.Infrastructure;

namespace Paqueteria.IntegrationTests;

/// <summary>
/// El modelo de EF describe el esquema real que creó schema.sql: mismas tablas, columnas,
/// tipos, nulabilidad y nombres de claves e índices. Las migraciones futuras se generan a
/// partir del modelo, así que un nombre distinto produciría migraciones que fallan.
/// </summary>
public class ModeloEsquemaTests(ServidorPostgres servidor) : PruebaConBaseDeDatos(servidor)
{
    /// <summary>
    /// Índices que EF no puede expresar (por expresión o de exclusión). Existen solo en
    /// schema.sql; cualquier otro índice de la BD debe estar en el modelo.
    /// </summary>
    private static readonly string[] IndicesSoloEnSql =
    [
        "agencias.uq_agencias_nombre",          // único sobre lower(nombre)
        "usuarios_plataforma.uq_usuarios_plataforma_correo", // único sobre lower(correo)
        "clientes.ix_clientes_correo",          // lower(correo), parcial
        "clientes.ix_clientes_nombre_sin_tildes_trgm", // GIN fn_sin_tildes(nombres || ' ' || apellidos)
        "paquetes.uq_paquetes_tracking_vigente", // único sobre (agencia_id, upper(tracking_externo)), parcial
        "tarifas_envio.ex_tarifas_sin_traslape", // EXCLUDE USING gist
        "usuarios.uq_usuarios_correo",          // único sobre lower(correo)
    ];

    [Fact]
    public async Task TablasYColumnasCoinciden()
    {
        var modelo = ModeloRelacional();
        var esperado = modelo.Tables
            .SelectMany(t => t.Columns.Select(c => $"{t.Name}.{c.Name} {c.StoreType}{(c.IsNullable ? "" : " NOT NULL")}"));

        var actual = await ConsultarAsync(
            $"""
            select c.relname || '.' || a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
                   || case when a.attnotnull then ' NOT NULL' else '' end
            from pg_attribute a
            join pg_class c on c.oid = a.attrelid
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = '{PaqueteriaDbContext.Esquema}' and c.relkind = 'r'
              and c.relname <> '{PaqueteriaDbContext.TablaHistorialMigraciones}'
              and a.attnum > 0 and not a.attisdropped
            """);

        MismoConjunto(enModelo: esperado, enBd: actual);
    }

    [Fact]
    public async Task VistaFacturasSaldoCoincide()
    {
        var modelo = ModeloRelacional();
        var esperado = modelo.Views
            .SelectMany(v => v.Columns.Select(c => $"{v.Name}.{c.Name} {c.StoreType}"));

        var actual = await ConsultarAsync(
            $"""
            select c.relname || '.' || a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
            from pg_attribute a
            join pg_class c on c.oid = a.attrelid
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = '{PaqueteriaDbContext.Esquema}' and c.relkind = 'v'
              and a.attnum > 0 and not a.attisdropped
            """);

        MismoConjunto(enModelo: esperado, enBd: actual);
    }

    [Fact]
    public async Task ClavesPrimariasYForaneasCoinciden()
    {
        var modelo = ModeloRelacional();
        var esperado = modelo.Tables
            .SelectMany(t => t.ForeignKeyConstraints
                .Select(fk => $"FK {t.Name}.{fk.Name} ({Columnas(fk.Columns)}) -> {fk.PrincipalTable.Name} ({Columnas(fk.PrincipalColumns)}) {Accion(fk.OnDeleteAction)}")
                .Append($"PK {t.Name}.{t.PrimaryKey!.Name} ({Columnas(t.PrimaryKey.Columns)})"));

        var actual = await ConsultarAsync(
            $"""
            select case c.contype when 'p' then 'PK ' else 'FK ' end
                   || t.relname || '.' || c.conname || ' (' || {ColumnasSql("c.conrelid", "c.conkey")} || ')'
                   || case when c.contype = 'f'
                           then ' -> ' || rt.relname || ' (' || {ColumnasSql("c.confrelid", "c.confkey")} || ')'
                                || case c.confdeltype when 'a' then ' NO ACTION' when 'r' then ' RESTRICT'
                                                      when 'c' then ' CASCADE' else ' SET NULL/DEFAULT' end
                           else '' end
            from pg_constraint c
            join pg_class t on t.oid = c.conrelid
            join pg_namespace n on n.oid = t.relnamespace
            left join pg_class rt on rt.oid = c.confrelid
            where n.nspname = '{PaqueteriaDbContext.Esquema}' and c.contype in ('p', 'f')
              and t.relname <> '{PaqueteriaDbContext.TablaHistorialMigraciones}'
            """);

        MismoConjunto(enModelo: esperado, enBd: actual);
    }

    [Fact]
    public async Task UnicosEIndicesCoinciden()
    {
        var modelo = ModeloRelacional();
        // En la BD, los UNIQUE de columna son restricciones; EF los modela como índices únicos
        // (o claves alternas si son destino de una FK). Ambos se ven como índices con el mismo nombre.
        var esperado = modelo.Tables
            .SelectMany(t => t.UniqueConstraints
                .Where(u => !u.GetIsPrimaryKey())
                .Select(u => $"{t.Name}.{u.Name} ({Columnas(u.Columns)}) UNIQUE")
                .Concat(t.Indexes.Select(i =>
                    $"{t.Name}.{i.Name} ({Columnas(i.Columns)}){(i.IsUnique ? " UNIQUE" : "")}{(i.Filter is null ? "" : " WHERE")}")));

        var indices = await ConsultarAsync(
            $"""
            select case when ix.indexprs is not null or c.contype = 'x' then 'SQL ' else '' end
                   || t.relname || '.' || i.relname
                   || case when ix.indexprs is not null or c.contype = 'x' then ''
                           else ' (' || {ColumnasSql("t.oid", "ix.indkey::int2[]")} || ')'
                                || case when ix.indisunique then ' UNIQUE' else '' end
                                || case when ix.indpred is not null then ' WHERE' else '' end
                      end
            from pg_index ix
            join pg_class i on i.oid = ix.indexrelid
            join pg_class t on t.oid = ix.indrelid
            join pg_namespace n on n.oid = t.relnamespace
            left join pg_constraint c on c.conindid = ix.indexrelid and c.conrelid = ix.indrelid and c.contype in ('u', 'x')
            where n.nspname = '{PaqueteriaDbContext.Esquema}' and not ix.indisprimary
              and t.relname <> '{PaqueteriaDbContext.TablaHistorialMigraciones}'
            """);

        var soloSql = indices.Where(i => i.StartsWith("SQL ")).Select(i => i["SQL ".Length..]);
        MismoConjunto(enModelo: IndicesSoloEnSql, enBd: soloSql, "índices solo en SQL");
        MismoConjunto(enModelo: esperado, enBd: indices.Where(i => !i.StartsWith("SQL ")));
    }

    private IRelationalModel ModeloRelacional()
    {
        using var db = NuevoContexto();
        return db.GetService<IDesignTimeModel>().Model.GetRelationalModel();
    }

    private async Task<List<string>> ConsultarAsync(string sql)
    {
        await using var conexion = new NpgsqlConnection(BaseDeDatos.ConexionDueno);
        await conexion.OpenAsync(Ct);
        await using var comando = new NpgsqlCommand(sql, conexion);
        await using var lector = await comando.ExecuteReaderAsync(Ct);
        var filas = new List<string>();
        while (await lector.ReadAsync(Ct))
        {
            filas.Add(lector.GetString(0));
        }
        return filas;
    }

    /// <summary>Nombres de columnas, en orden, a partir de un arreglo de attnum.</summary>
    private static string ColumnasSql(string relacion, string attnums) =>
        $"""
        (select string_agg(a.attname, ', ' order by k.orden)
         from unnest({attnums}) with ordinality k(attnum, orden)
         join pg_attribute a on a.attrelid = {relacion} and a.attnum = k.attnum)
        """;

    /// <summary>Compara como conjuntos y, si difieren, dice qué sobra en cada lado.</summary>
    private static void MismoConjunto(IEnumerable<string> enModelo, IEnumerable<string> enBd, string que = "objetos")
    {
        var modelo = enModelo.ToList();
        var bd = enBd.ToList();
        var soloModelo = modelo.Except(bd).Order(StringComparer.Ordinal).ToList();
        var soloBd = bd.Except(modelo).Order(StringComparer.Ordinal).ToList();
        var duplicados = bd.GroupBy(x => x).Where(g => g.Count() > 1).Select(g => g.Key).ToList();

        if (soloModelo.Count > 0 || soloBd.Count > 0 || duplicados.Count > 0)
        {
            throw new Xunit.Sdk.XunitException(
                $"El modelo EF y la BD difieren en {que}.\n" +
                $"Solo en el modelo EF:\n  {string.Join("\n  ", soloModelo)}\n" +
                $"Solo en la BD:\n  {string.Join("\n  ", soloBd)}\n" +
                $"Duplicados en la BD:\n  {string.Join("\n  ", duplicados)}");
        }
    }

    private static string Columnas(IEnumerable<IColumnBase> columnas) => string.Join(", ", columnas.Select(c => c.Name));

    private static string Accion(ReferentialAction accion) => accion switch
    {
        ReferentialAction.NoAction => "NO ACTION",
        ReferentialAction.Restrict => "RESTRICT",
        ReferentialAction.Cascade => "CASCADE",
        _ => "SET NULL/DEFAULT",
    };
}
