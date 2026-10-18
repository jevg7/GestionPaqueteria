using Npgsql;

namespace Paqueteria.Api.Middleware;

public static class PostgresExceptionMapper
{
    // Incluye errores del COMMIT, con o sin DbUpdateException intermedia.
    public static PostgresException? Find(Exception? exception)
    {
        for (var current = exception; current is not null; current = current.InnerException)
        {
            if (current is PostgresException postgres)
            {
                return postgres;
            }
        }
        return null;
    }

    // NpgsqlException sin SQLSTATE: la BD no respondió (conexión rechazada, timeout, red).
    // PostgresException también hereda de NpgsqlException, pero esa sí es una respuesta de la BD.
    public static bool IsDatabaseUnavailable(Exception? exception)
    {
        for (var current = exception; current is not null; current = current.InnerException)
        {
            if (current is NpgsqlException and not PostgresException)
            {
                return true;
            }
        }
        return false;
    }

    // 23514 va siempre a 400: el backend valida antes los conflictos de estado (anular con pagos,
    // pagar una factura anulada, cambiar un estado final…) y responde 409 por su cuenta. Si uno
    // de esos casos llega hasta la BD, la regla sigue protegida y la respuesta es 400.
    public static int GetStatusCode(PostgresException exception) => exception.SqlState switch
    {
        PostgresErrorCodes.UniqueViolation or
        PostgresErrorCodes.ExclusionViolation or
        PostgresErrorCodes.RestrictViolation => StatusCodes.Status409Conflict,
        PostgresErrorCodes.CheckViolation or
        PostgresErrorCodes.ForeignKeyViolation => StatusCodes.Status400BadRequest,
        PostgresErrorCodes.InsufficientPrivilege => StatusCodes.Status500InternalServerError,
        _ => StatusCodes.Status500InternalServerError
    };
}
