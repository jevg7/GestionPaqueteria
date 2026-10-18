using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using Paqueteria.Api.Services;

namespace Paqueteria.Api.Middleware;

// Las solicitudes canceladas por el cliente no llegan aquí: ExceptionHandlerMiddleware
// responde 499 sin invocar los IExceptionHandler ni registrar un error.
public sealed class GlobalExceptionHandler(
    ILogger<GlobalExceptionHandler> logger,
    IProblemDetailsService problemDetailsService) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        // Regla de negocio: su mensaje lo escribió el backend para el usuario y va en "detail".
        var regla = exception as ReglaDeNegocioException;
        var postgres = regla is null ? PostgresExceptionMapper.Find(exception) : null;
        var status = regla?.StatusCode ?? (postgres is not null
            ? PostgresExceptionMapper.GetStatusCode(postgres)
            : PostgresExceptionMapper.IsDatabaseUnavailable(exception)
                ? StatusCodes.Status503ServiceUnavailable
                : StatusCodes.Status500InternalServerError);

        // No pasar exception al logger: Message/Detail/ToString pueden contener SQL y secretos.
        // El mensaje de una regla de negocio sí se registra: lo escribimos nosotros, solo con códigos.
        var level = postgres?.SqlState == PostgresErrorCodes.InsufficientPrivilege
            ? LogLevel.Critical
            : status >= StatusCodes.Status500InternalServerError ? LogLevel.Error : LogLevel.Warning;
        logger.Log(level,
            "Solicitud fallida. Tipo: {ExceptionType}; SQLSTATE: {SqlState}; HTTP: {StatusCode}; Regla: {Regla}; TraceId: {TraceId}.",
            exception.GetType().Name, postgres?.SqlState, status, regla?.Message, httpContext.TraceIdentifier);

        var problem = new ProblemDetails
        {
            Status = status,
            Detail = regla?.Message,
            Title = status switch
            {
                StatusCodes.Status409Conflict => "Conflicto con el estado actual de los datos.",
                StatusCodes.Status400BadRequest => "Los datos no cumplen las restricciones requeridas.",
                StatusCodes.Status403Forbidden => "No tiene permiso para esta operación sobre este registro.",
                StatusCodes.Status503ServiceUnavailable when regla is not null => "Un servicio externo no está disponible en este momento.",
                StatusCodes.Status503ServiceUnavailable => "La base de datos no está disponible en este momento.",
                _ => "Ocurrió un error interno al procesar la solicitud."
            },
            // Mismas referencias que usa ASP.NET Core por defecto (RFC 9110).
            Type = status switch
            {
                StatusCodes.Status400BadRequest => "https://tools.ietf.org/html/rfc9110#section-15.5.1",
                StatusCodes.Status403Forbidden => "https://tools.ietf.org/html/rfc9110#section-15.5.4",
                StatusCodes.Status409Conflict => "https://tools.ietf.org/html/rfc9110#section-15.5.10",
                StatusCodes.Status503ServiceUnavailable => "https://tools.ietf.org/html/rfc9110#section-15.6.4",
                _ => "https://tools.ietf.org/html/rfc9110#section-15.6.1"
            }
        };
        problem.Extensions["traceId"] = httpContext.TraceIdentifier;
        httpContext.Response.StatusCode = status;

        if (!await problemDetailsService.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = problem
        }))
        {
            // Mantener el contrato JSON incluso si Accept no admite el writer estándar.
            await httpContext.Response.WriteAsJsonAsync(problem, options: null,
                contentType: "application/problem+json", cancellationToken: cancellationToken);
        }
        return true;
    }
}
