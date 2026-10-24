using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Paqueteria.Api.Auth;
using Paqueteria.Api.DTOs;
using Paqueteria.Api.Services;

namespace Paqueteria.Api.Controllers;

/// <summary>
/// Facturas (comprobante interno en USD) y sus pagos. ADMIN y AGENTE emiten y cobran; solo ADMIN anula.
/// </summary>
[ApiController]
[Route("api/invoices")]
[Authorize(Roles = Permisos.Facturar)]
[ProducesResponseType(StatusCodes.Status401Unauthorized)]
[ProducesResponseType(StatusCodes.Status403Forbidden)]
public sealed class InvoicesController(FacturacionService facturacion) : ControllerBase
{
    /// <summary>Busca por número; filtra por cliente y estado de pago (PENDIENTE, PARCIAL, PAGADA, ANULADA).</summary>
    [HttpGet]
    [ProducesResponseType<PagedResponse<InvoiceSummaryResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public Task<PagedResponse<InvoiceSummaryResponse>> Search([FromQuery] InvoiceSearchQuery query, CancellationToken cancellationToken) =>
        facturacion.BuscarAsync(query, cancellationToken);

    /// <summary>Factura con sus líneas, sus pagos, lo pagado y el saldo.</summary>
    [HttpGet("{id:long}")]
    [ProducesResponseType<InvoiceResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<InvoiceResponse>> Get(long id, CancellationToken cancellationToken) =>
        await facturacion.ObtenerAsync(id, cancellationToken) is { } factura ? factura : NotFound();

    /// <summary>Emite la factura de paquetes PENDIENTE_DE_PAGO del cliente (una línea por paquete).</summary>
    [HttpPost]
    [ProducesResponseType<InvoiceResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<InvoiceResponse>> Create(CreateInvoiceRequest request, CancellationToken cancellationToken)
    {
        var factura = await facturacion.EmitirAsync(request, cancellationToken);
        return CreatedAtAction(nameof(Get), new { id = factura.Id }, factura);
    }

    /// <summary>
    /// Registra un pago en USD o en córdobas (NIO, con el tipo de cambio vigente). Si salda la factura,
    /// sus paquetes pasan a PAGADO.
    /// </summary>
    [HttpPost("{id:long}/payments")]
    [ProducesResponseType<PaymentResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<PaymentResponse>> RegisterPayment(long id, CreatePaymentRequest request, CancellationToken cancellationToken) =>
        await facturacion.RegistrarPagoAsync(id, request, cancellationToken) is { } pago
            ? CreatedAtAction(nameof(Get), new { id }, pago)
            : NotFound();

    /// <summary>EMITIDA → ANULADA, con motivo y solo sin pagos aplicados. Solo ADMIN.</summary>
    [HttpPost("{id:long}/void")]
    [Authorize(Roles = Permisos.AdministrarFinanzas)]
    [ProducesResponseType<InvoiceResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<InvoiceResponse>> Void(long id, VoidRequest request, CancellationToken cancellationToken) =>
        await facturacion.AnularFacturaAsync(id, request.Motivo, cancellationToken) is { } factura ? factura : NotFound();
}

/// <summary>Pagos: se registran en su factura (POST /api/invoices/{id}/payments); aquí solo se anulan.</summary>
[ApiController]
[Route("api/payments")]
[Authorize(Roles = Permisos.AdministrarFinanzas)]
[ProducesResponseType(StatusCodes.Status401Unauthorized)]
[ProducesResponseType(StatusCodes.Status403Forbidden)]
public sealed class PaymentsController(FacturacionService facturacion) : ControllerBase
{
    /// <summary>
    /// APLICADO → ANULADO, con motivo. Si la factura estaba saldada, sus paquetes vuelven a
    /// PENDIENTE_DE_PAGO (409 si alguno ya pasó a entrega). Solo ADMIN.
    /// </summary>
    [HttpPost("{id:long}/void")]
    [ProducesResponseType<PaymentResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<PaymentResponse>> Void(long id, VoidRequest request, CancellationToken cancellationToken) =>
        await facturacion.AnularPagoAsync(id, request.Motivo, cancellationToken) is { } pago ? pago : NotFound();
}

/// <summary>
/// Tipo de cambio diario (córdobas por dólar). El vigente lo consultan ADMIN, AGENTE y REPARTIDOR (cobra contra entrega);
/// la lista, ADMIN y AGENTE; solo ADMIN lo registra. Cada acción declara su permiso: si el controller exigiera uno, se
/// combinaría con Y con el de la acción.
/// </summary>
[ApiController]
[Route("api/exchange-rates")]
[ProducesResponseType(StatusCodes.Status401Unauthorized)]
[ProducesResponseType(StatusCodes.Status403Forbidden)]
public sealed class ExchangeRatesController(TiposCambioService tiposCambio) : ControllerBase
{
    /// <summary>Los últimos 60 registrados, del más reciente al más antiguo.</summary>
    [HttpGet]
    [Authorize(Roles = Permisos.Facturar)]
    [ProducesResponseType<IReadOnlyList<ExchangeRateResponse>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<ExchangeRateResponse>> List(CancellationToken cancellationToken) =>
        tiposCambio.ListarAsync(cancellationToken);

    /// <summary>El que se aplica hoy: el más reciente con fecha ≤ hoy en Managua. 404 si no hay ninguno.</summary>
    [HttpGet("current")]
    [Authorize(Roles = Permisos.ConsultarTipoDeCambio)]
    [ProducesResponseType<ExchangeRateResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ExchangeRateResponse>> Current(CancellationToken cancellationToken) =>
        await tiposCambio.VigenteAsync(cancellationToken) is { } t
            ? new ExchangeRateResponse(t.Fecha, t.NioPorUsd, t.CreadoPorUsuarioId, t.ActualizadoEn)
            : NotFound();

    /// <summary>Registra o corrige el tipo de cambio de un día (yyyy-MM-dd). Solo ADMIN.</summary>
    [HttpPut("{fecha}")]
    [Authorize(Roles = Permisos.AdministrarFinanzas)]
    [ProducesResponseType<ExchangeRateResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public Task<ExchangeRateResponse> Set(DateOnly fecha, ExchangeRateRequest request, CancellationToken cancellationToken) =>
        tiposCambio.RegistrarAsync(fecha, request.NioPorUsd, cancellationToken);
}
