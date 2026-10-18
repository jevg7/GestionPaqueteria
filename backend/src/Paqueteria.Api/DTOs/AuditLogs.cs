using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.DTOs;

public sealed record AuditLogResponse(
    long Id,
    DateTimeOffset Fecha,
    long? UsuarioId,
    string? Usuario,
    string Tabla,
    string RegistroId,
    AccionAuditoria Accion,
    JsonElement? ValoresAnteriores,
    JsonElement? ValoresNuevos,
    string? Origen,
    string? TraceId);

/// <summary>Filtros de GET /api/audit-logs. Más recientes primero.</summary>
public sealed class AuditLogSearchQuery
{
    /// <summary>Nombre de la tabla: clientes, paquetes, pagos…</summary>
    [MaxLength(63)]
    public string? Tabla { get; init; }

    /// <summary>Clave del registro (con Tabla: la historia de un registro).</summary>
    [MaxLength(100)]
    public string? RegistroId { get; init; }

    public long? UsuarioId { get; init; }

    /// <summary>INSERT, UPDATE o DELETE.</summary>
    public string? Accion { get; init; }

    public DateTimeOffset? Desde { get; init; }

    public DateTimeOffset? Hasta { get; init; }

    [Range(1, int.MaxValue, ErrorMessage = "page empieza en 1.")]
    public int Page { get; init; } = 1;

    [Range(1, 100, ErrorMessage = "pageSize debe estar entre 1 y 100.")]
    public int PageSize { get; init; } = 50;
}
