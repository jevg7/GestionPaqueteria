using System.Security.Cryptography;
using System.Text;

namespace Paqueteria.Api.Data.Sql;

/// <summary>
/// database/schema.sql, embebido en el ensamblado, que ejecuta la migración Baseline.
/// </summary>
/// <remarks>
/// schema.sql quedó congelado como baseline v2 (multi-agencia): las BD ya migradas no vuelven a
/// ejecutar la migración, así que editarlo haría que las BD nuevas y las existentes difieran.
/// Todo cambio de esquema posterior va en una migración nueva. Si el archivo cambia, su
/// hash deja de coincidir y la migración se niega a correr (y falla un test).
/// </remarks>
public static class EsquemaBaseline
{
    private const string NombreRecurso = "Paqueteria.Api.Data.Sql.schema.sql";

    /// <summary>SHA-256 de schema.sql v2 en UTF-8 con fin de línea LF, congelado en la migración Baseline.</summary>
    public const string Sha256Congelado = "df95882ebd0efe595965d0f9bda420c83f71027eadf066ab544b3812db1d2cb2";

    public static string Leer()
    {
        var sql = LeerSinVerificar();
        var hash = CalcularSha256(sql);
        if (hash != Sha256Congelado)
        {
            throw new InvalidOperationException(
                "database/schema.sql cambió después de congelarse como baseline v2" +
                $"(SHA-256 esperado {Sha256Congelado}, actual {hash}). " +
                "Los cambios de esquema van en una migración nueva (dotnet ef migrations add); " +
                "restaure schema.sql a su versión congelada.");
        }
        return sql;
    }

    public static string LeerSinVerificar()
    {
        using var stream = typeof(EsquemaBaseline).Assembly.GetManifestResourceStream(NombreRecurso)
            ?? throw new InvalidOperationException($"No se encontró el recurso embebido {NombreRecurso}.");
        using var reader = new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true);
        // Git en Windows puede convertir LF en CRLF: se normaliza para que el hash no dependa de eso.
        return reader.ReadToEnd().ReplaceLineEndings("\n");
    }

    public static string CalcularSha256(string sql) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(sql)));
}
