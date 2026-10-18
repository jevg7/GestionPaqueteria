using System.ComponentModel.DataAnnotations;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.DTOs;

// Las operaciones reciben varios paquetes o entregas: una visita puede llevar varios paquetes del
// mismo cliente. En la BD sigue habiendo una fila de entregas por paquete.

/// <summary>Programa un delivery. Sin dirección se usa la del cliente.</summary>
public sealed record ScheduleDeliveryRequest(
    [Required(ErrorMessage = "Indique los paquetes.")]
    [MinLength(1, ErrorMessage = "Indique al menos un paquete.")]
    [MaxLength(50, ErrorMessage = "Hasta 50 paquetes por entrega.")]
    long[] PaqueteIds,
    string? Direccion,
    DateTimeOffset? FechaProgramada,
    long? ResponsableUsuarioId,
    string? Observaciones);

/// <summary>Retiro en agencia: el cliente (o su autorizado) se lleva los paquetes ya pagados.</summary>
public sealed record PickupRequest(
    [Required(ErrorMessage = "Indique los paquetes.")]
    [MinLength(1, ErrorMessage = "Indique al menos un paquete.")]
    [MaxLength(50, ErrorMessage = "Hasta 50 paquetes por retiro.")]
    long[] PaqueteIds,
    [Required(ErrorMessage = "Indique quién recibe.")]
    [MaxLength(150, ErrorMessage = "El nombre de quien recibe admite hasta 150 caracteres.")]
    string PersonaRecibe,
    DateTimeOffset? Fecha,
    string? Observaciones);

/// <summary>Sale a ruta. Un repartidor sale con sus entregas (queda como responsable).</summary>
public sealed record DispatchRequest(
    [Required(ErrorMessage = "Indique las entregas.")]
    [MinLength(1, ErrorMessage = "Indique al menos una entrega.")]
    [MaxLength(100, ErrorMessage = "Hasta 100 entregas por salida.")]
    long[] EntregaIds,
    long? ResponsableUsuarioId);

/// <summary>Cobro contra entrega: se cobra el saldo completo de las facturas, en la moneda indicada.</summary>
public sealed record CollectOnDeliveryRequest(
    [EnumDataType(typeof(Moneda), ErrorMessage = "La moneda debe ser USD o NIO.")]
    Moneda Moneda,
    [EnumDataType(typeof(MetodoPago), ErrorMessage = "El método de pago debe ser EFECTIVO, TRANSFERENCIA, TARJETA u OTRO.")]
    MetodoPago MetodoPago,
    [MaxLength(100, ErrorMessage = "La referencia admite hasta 100 caracteres.")]
    string? Referencia);

public sealed record DeliverRequest(
    [Required(ErrorMessage = "Indique las entregas.")]
    [MinLength(1, ErrorMessage = "Indique al menos una entrega.")]
    [MaxLength(50, ErrorMessage = "Hasta 50 entregas por visita.")]
    long[] EntregaIds,
    [Required(ErrorMessage = "Indique quién recibe.")]
    [MaxLength(150, ErrorMessage = "El nombre de quien recibe admite hasta 150 caracteres.")]
    string PersonaRecibe,
    DateTimeOffset? Fecha,
    CollectOnDeliveryRequest? Cobro);

/// <summary>Delivery fallido (EN_RUTA) o cancelación de un delivery que no salió (PENDIENTE).</summary>
public sealed record CloseDeliveryRequest(
    [Required(ErrorMessage = "Indique las entregas.")]
    [MinLength(1, ErrorMessage = "Indique al menos una entrega.")]
    [MaxLength(100, ErrorMessage = "Hasta 100 entregas por solicitud.")]
    long[] EntregaIds,
    [Required(ErrorMessage = "El motivo es obligatorio.")]
    string Motivo);

public sealed record DeliveryClientRef(long Id, string CodigoCliente, string Nombres, string Apellidos, string Telefono);

public sealed record DeliveryPackageRef(long Id, string CodigoPaquete, string Descripcion, PackageStateRef Estado);

public sealed record UserRef(long Id, string Nombre);

/// <summary>Lo que hay que cobrar contra entrega: saldo en USD de la factura del paquete.</summary>
public sealed record PendingCharge(long FacturaId, string NumeroFactura, decimal SaldoUsd);

public sealed record DeliveryResponse(
    long Id,
    DeliveryPackageRef Paquete,
    DeliveryClientRef Cliente,
    TipoEntrega TipoEntrega,
    EstadoEntrega Estado,
    string? Direccion,
    DateTimeOffset? FechaProgramada,
    DateTimeOffset? FechaEntrega,
    string? PersonaRecibe,
    UserRef? Responsable,
    string? Observaciones,
    PendingCharge? CobroPendiente,
    long CreadoPorUsuarioId,
    DateTimeOffset CreadoEn,
    DateTimeOffset ActualizadoEn);

public sealed record DeliverResponse(IReadOnlyList<DeliveryResponse> Entregas, IReadOnlyList<PaymentResponse> Cobros);

/// <summary>Filtros de GET /api/deliveries. Un REPARTIDOR solo ve las entregas asignadas a él.</summary>
public sealed class DeliverySearchQuery
{
    /// <summary>PENDIENTE, EN_RUTA, ENTREGADA, FALLIDA o CANCELADA.</summary>
    public string? Estado { get; init; }

    /// <summary>RETIRO_EN_AGENCIA o DELIVERY.</summary>
    public string? TipoEntrega { get; init; }

    public long? ClienteId { get; init; }

    public long? PaqueteId { get; init; }

    public long? ResponsableUsuarioId { get; init; }

    [Range(1, int.MaxValue, ErrorMessage = "page empieza en 1.")]
    public int Page { get; init; } = 1;

    [Range(1, 100, ErrorMessage = "pageSize debe estar entre 1 y 100.")]
    public int PageSize { get; init; } = 20;
}
