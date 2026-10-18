using System.ComponentModel.DataAnnotations;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.DTOs
{
    /// <summary>Factura (comprobante interno, en USD) de paquetes PENDIENTE_DE_PAGO de un cliente.</summary>
    public sealed record CreateInvoiceRequest(
        [Range(1, long.MaxValue, ErrorMessage = "El cliente es obligatorio.")]
        long ClienteId,
        [Required(ErrorMessage = "Indique los paquetes a facturar.")]
        [MinLength(1, ErrorMessage = "Indique al menos un paquete.")]
        [MaxLength(200, ErrorMessage = "Se facturan hasta 200 paquetes por factura.")]
        long[] PaqueteIds);

    /// <summary>Pago en USD o en córdobas (NIO); los córdobas se convierten con el tipo de cambio vigente.</summary>
    public sealed record CreatePaymentRequest(
        [EnumDataType(typeof(Moneda), ErrorMessage = "La moneda debe ser USD o NIO.")]
        Moneda Moneda,
        [Range(typeof(decimal), "0.01", "9999999999999999.99", ErrorMessage = "El monto debe ser mayor que cero.")]
        decimal Monto,
        [EnumDataType(typeof(MetodoPago), ErrorMessage = "El método de pago debe ser EFECTIVO, TRANSFERENCIA, TARJETA u OTRO.")]
        MetodoPago MetodoPago,
        [MaxLength(100, ErrorMessage = "La referencia admite hasta 100 caracteres.")]
        string? Referencia) : IValidatableObject
    {
        public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
        {
            if (Monto != Math.Round(Monto, 2))
            {
                yield return new ValidationResult("El monto admite hasta 2 decimales.", [nameof(Monto)]);
            }
        }
    }

    /// <summary>Anulación de una factura o un pago: el motivo queda registrado.</summary>
    public sealed record VoidRequest(
        [Required(ErrorMessage = "El motivo de la anulación es obligatorio.")]
        string Motivo);

    public sealed record InvoiceLineResponse(
        long Id,
        long? PaqueteId,
        string? CodigoPaquete,
        string Descripcion,
        decimal Cantidad,
        decimal PrecioUnitario,
        decimal Subtotal);

    public sealed record PaymentResponse(
        long Id,
        long FacturaId,
        string NumeroFactura,
        decimal Monto,
        Moneda Moneda,
        decimal? MontoMoneda,
        decimal? TipoCambioAplicado,
        MetodoPago MetodoPago,
        string? Referencia,
        DateTimeOffset Fecha,
        EstadoPago Estado,
        string? MotivoAnulacion,
        DateTimeOffset? AnuladoEn,
        long UsuarioId);

    /// <summary>Resumen para listas: montos, saldo y estado de pago (de v_facturas_saldo).</summary>
    public sealed record InvoiceSummaryResponse(
        long Id,
        string NumeroFactura,
        PackageClientRef Cliente,
        DateTimeOffset Fecha,
        decimal Total,
        decimal Pagado,
        decimal Saldo,
        EstadoFactura Estado,
        EstadoPagoFactura EstadoPago);

    public sealed record InvoiceResponse(
        long Id,
        string NumeroFactura,
        PackageClientRef Cliente,
        DateTimeOffset Fecha,
        Moneda Moneda,
        decimal Subtotal,
        decimal Descuento,
        decimal Impuestos,
        decimal Total,
        decimal Pagado,
        decimal Saldo,
        EstadoFactura Estado,
        EstadoPagoFactura EstadoPago,
        string? MotivoAnulacion,
        DateTimeOffset? AnuladaEn,
        long UsuarioId,
        IReadOnlyList<InvoiceLineResponse> Lineas,
        IReadOnlyList<PaymentResponse> Pagos);

    /// <summary>Filtros de GET /api/invoices.</summary>
    public sealed class InvoiceSearchQuery
    {
        /// <summary>Busca en el número de factura.</summary>
        [MaxLength(30, ErrorMessage = "La búsqueda admite hasta 30 caracteres.")]
        public string? Search { get; init; }

        public long? ClienteId { get; init; }

        /// <summary>PENDIENTE, PARCIAL, PAGADA o ANULADA.</summary>
        public string? EstadoPago { get; init; }

        [Range(1, int.MaxValue, ErrorMessage = "page empieza en 1.")]
        public int Page { get; init; } = 1;

        [Range(1, 100, ErrorMessage = "pageSize debe estar entre 1 y 100.")]
        public int PageSize { get; init; } = 20;
    }

    public sealed record ExchangeRateRequest(
        [Range(typeof(decimal), "0.0001", "99999999.9999", ErrorMessage = "El tipo de cambio debe ser mayor que cero.")]
        decimal NioPorUsd) : IValidatableObject
    {
        public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
        {
            if (NioPorUsd != Math.Round(NioPorUsd, 4))
            {
                yield return new ValidationResult("El tipo de cambio admite hasta 4 decimales.", [nameof(NioPorUsd)]);
            }
        }
    }

    public sealed record ExchangeRateResponse(DateOnly Fecha, decimal NioPorUsd, long CreadoPorUsuarioId, DateTimeOffset ActualizadoEn);
}
