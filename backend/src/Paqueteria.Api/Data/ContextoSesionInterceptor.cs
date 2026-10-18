using System.Data.Common;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Npgsql;
using Paqueteria.Api.Auth;

namespace Paqueteria.Api.Data;

/// <summary>
/// Al abrir cada conexión dentro de una solicitud HTTP, fija las variables de sesión que usa la BD:
/// <list type="bullet">
/// <item><c>paqueteria.agencia_id</c>: RLS (qué filas se ven) y el DEFAULT de agencia_id al insertar.</item>
/// <item><c>paqueteria.usuario_id</c>, <c>paqueteria.origen</c>, <c>paqueteria.trace_id</c>: auditoría (fn_auditar).</item>
/// </list>
/// Npgsql limpia la sesión al devolver la conexión al pool, así que no pasan de una solicitud a otra.
/// Sin solicitud HTTP (tests, herramientas) no fija nada: sin agencia, la BD no deja leer ni escribir
/// datos de agencia.
/// </summary>
public sealed class ContextoSesionInterceptor(IHttpContextAccessor httpContextAccessor) : DbConnectionInterceptor
{
    private const string Sql =
        "select set_config('paqueteria.agencia_id', @agencia, false), " +
        "set_config('paqueteria.usuario_id', @usuario, false), " +
        "set_config('paqueteria.origen', @origen, false), " +
        "set_config('paqueteria.trace_id', @traza, false)";

    public override void ConnectionOpened(DbConnection connection, ConnectionEndEventData eventData)
    {
        using var comando = CrearComando(connection);
        comando?.ExecuteNonQuery();
    }

    public override async Task ConnectionOpenedAsync(
        DbConnection connection, ConnectionEndEventData eventData, CancellationToken cancellationToken = default)
    {
        await using var comando = CrearComando(connection);
        if (comando is not null)
        {
            await comando.ExecuteNonQueryAsync(cancellationToken);
        }
    }

    private DbCommand? CrearComando(DbConnection connection)
    {
        var http = httpContextAccessor.HttpContext;
        if (http is null)
        {
            return null;
        }

        // Durante la autenticación todavía no hay claims: esa conexión solo usa fn_identificar_usuario
        // (SECURITY DEFINER) y se cierra antes de que la solicitud use la BD.
        var agenciaId = http.User.FindFirstValue(ClaimsPaqueteria.AgenciaId) ?? "";
        var usuarioId = http.User.FindFirstValue(ClaimsPaqueteria.UsuarioId) ?? "";
        var origen = $"{http.Request.Method} {http.Request.Path}";
        // Los dueños de la plataforma no están en usuarios: su id queda en el origen de la auditoría.
        if (http.User.FindFirstValue(ClaimsPaqueteria.PlataformaId) is { } plataformaId)
        {
            origen = $"[plataforma {plataformaId}] {origen}";
        }

        var comando = connection.CreateCommand();
        comando.CommandText = Sql;
        comando.Parameters.Add(new NpgsqlParameter("agencia", agenciaId));
        comando.Parameters.Add(new NpgsqlParameter("usuario", usuarioId));
        comando.Parameters.Add(new NpgsqlParameter("origen", origen.Length > 200 ? origen[..200] : origen));
        comando.Parameters.Add(new NpgsqlParameter("traza", http.TraceIdentifier));
        return comando;
    }
}
