using System.ComponentModel.DataAnnotations;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.DTOs;

public sealed record CreateShipmentRequest(
    [Required(ErrorMessage = "El método de envío es obligatorio (AEREO o MARITIMO).")]
    [MaxLength(20, ErrorMessage = "El método de envío admite hasta 20 caracteres.")]
    string MetodoEnvio,
    [Range(1, int.MaxValue, ErrorMessage = "La ruta es obligatoria (ver GET /api/catalogs).")]
    int RutaId,
    DateOnly? FechaLlegadaEstimada,
    string? Observaciones);

/// <summary>Datos editables de un embarque que no ha llegado ni se ha cancelado.</summary>
public sealed record UpdateShipmentRequest(DateOnly? FechaLlegadaEstimada, string? Observaciones);

public sealed record AssignPackagesRequest(
    [Required(ErrorMessage = "Indique los paquetes a asignar.")]
    [MinLength(1, ErrorMessage = "Indique al menos un paquete.")]
    [MaxLength(500, ErrorMessage = "Se asignan hasta 500 paquetes por solicitud.")]
    long[] PaqueteIds);

/// <summary>Fecha del hecho (salida o llegada). Vacía = ahora. Puede ser pasada, nunca futura.</summary>
public sealed record ShipmentEventRequest(DateTimeOffset? Fecha);

public sealed record RouteRef(int Id, string Nombre, string Origen, string Destino);

public sealed record ShipmentResponse(
    long Id,
    string CodigoEmbarque,
    ShippingMethodRef MetodoEnvio,
    RouteRef Ruta,
    EstadoEmbarque Estado,
    DateTimeOffset? FechaSalida,
    DateOnly? FechaLlegadaEstimada,
    DateTimeOffset? FechaLlegadaReal,
    string? Observaciones,
    int CantidadPaquetes,
    DateTimeOffset CreadoEn,
    DateTimeOffset ActualizadoEn);

/// <summary>Filtros de GET /api/shipments.</summary>
public sealed class ShipmentSearchQuery
{
    /// <summary>Busca en el código del embarque.</summary>
    [MaxLength(30, ErrorMessage = "La búsqueda admite hasta 30 caracteres.")]
    public string? Search { get; init; }

    /// <summary>ABIERTO, CERRADO, EN_TRANSITO, RECIBIDO o CANCELADO.</summary>
    public string? Estado { get; init; }

    /// <summary>AEREO o MARITIMO.</summary>
    public string? MetodoEnvio { get; init; }

    [Range(1, int.MaxValue, ErrorMessage = "page empieza en 1.")]
    public int Page { get; init; } = 1;

    [Range(1, 100, ErrorMessage = "pageSize debe estar entre 1 y 100.")]
    public int PageSize { get; init; } = 20;
}
