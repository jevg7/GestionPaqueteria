using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Paqueteria.Api.Auth;
using Paqueteria.Api.DTOs;
using Paqueteria.Api.Services;

namespace Paqueteria.Api.Controllers;

/// <summary>
/// Entregas: retiro en agencia y delivery (programar → salir a ruta → entregada/fallida), con cobro
/// contra entrega. Las operaciones reciben varios paquetes o entregas (una visita). Un REPARTIDOR solo
/// ve y opera las entregas asignadas a él; AGENTE y ADMIN pueden operar en su nombre.
/// </summary>
[ApiController]
[Route("api/deliveries")]
[Authorize(Roles = Permisos.LeerEntregas)]
[ProducesResponseType(StatusCodes.Status401Unauthorized)]
[ProducesResponseType(StatusCodes.Status403Forbidden)]
public sealed class DeliveriesController(EntregasService entregas) : ControllerBase
{
    /// <summary>Entregas más recientes primero, con lo pendiente de cobrar. Un repartidor ve solo las suyas.</summary>
    [HttpGet]
    [ProducesResponseType<PagedResponse<DeliveryResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public Task<PagedResponse<DeliveryResponse>> Search([FromQuery] DeliverySearchQuery query, CancellationToken cancellationToken) =>
        entregas.BuscarAsync(query, cancellationToken);

    [HttpGet("{id:long}")]
    [ProducesResponseType<DeliveryResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<DeliveryResponse>> Get(long id, CancellationToken cancellationToken) =>
        await entregas.ObtenerAsync(id, cancellationToken) is { } entrega ? entrega : NotFound();

    /// <summary>Programa el delivery de paquetes LISTO_PARA_ENTREGA de un cliente (sin dirección, la del cliente).</summary>
    [HttpPost]
    [Authorize(Roles = Permisos.ProgramarEntregas)]
    [ProducesResponseType<IReadOnlyList<DeliveryResponse>>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<IReadOnlyList<DeliveryResponse>>> Schedule(ScheduleDeliveryRequest request, CancellationToken cancellationToken) =>
        StatusCode(StatusCodes.Status201Created, await entregas.ProgramarAsync(request, cancellationToken));

    /// <summary>Retiro en agencia de paquetes LISTO_PARA_ENTREGA con la factura saldada: quedan ENTREGADO.</summary>
    [HttpPost("pickup")]
    [Authorize(Roles = Permisos.ProgramarEntregas)]
    [ProducesResponseType<IReadOnlyList<DeliveryResponse>>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<IReadOnlyList<DeliveryResponse>>> Pickup(PickupRequest request, CancellationToken cancellationToken) =>
        StatusCode(StatusCodes.Status201Created, await entregas.RegistrarRetiroAsync(request, cancellationToken));

    /// <summary>Sale a ruta: PENDIENTE → EN_RUTA, paquetes → EN_REPARTO.</summary>
    [HttpPost("dispatch")]
    [Authorize(Roles = Permisos.OperarReparto)]
    [ProducesResponseType<IReadOnlyList<DeliveryResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public Task<IReadOnlyList<DeliveryResponse>> Dispatch(DispatchRequest request, CancellationToken cancellationToken) =>
        entregas.DespacharAsync(request, cancellationToken);

    /// <summary>
    /// Entregado: EN_RUTA → ENTREGADA, paquetes → ENTREGADO. Si hay saldo, se cobra completo con los
    /// datos de "cobro" (USD o NIO); sin ellos, 409.
    /// </summary>
    [HttpPost("deliver")]
    [Authorize(Roles = Permisos.OperarReparto)]
    [ProducesResponseType<DeliverResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public Task<DeliverResponse> Deliver(DeliverRequest request, CancellationToken cancellationToken) =>
        entregas.ConfirmarEntregaAsync(request, cancellationToken);

    /// <summary>Fallida: EN_RUTA → FALLIDA, paquetes → LISTO_PARA_ENTREGA (se puede reprogramar).</summary>
    [HttpPost("fail")]
    [Authorize(Roles = Permisos.OperarReparto)]
    [ProducesResponseType<IReadOnlyList<DeliveryResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public Task<IReadOnlyList<DeliveryResponse>> Fail(CloseDeliveryRequest request, CancellationToken cancellationToken) =>
        entregas.MarcarFallidaAsync(request, cancellationToken);

    /// <summary>Cancela deliveries que no salieron (PENDIENTE → CANCELADA).</summary>
    [HttpPost("cancel")]
    [Authorize(Roles = Permisos.ProgramarEntregas)]
    [ProducesResponseType<IReadOnlyList<DeliveryResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public Task<IReadOnlyList<DeliveryResponse>> Cancel(CloseDeliveryRequest request, CancellationToken cancellationToken) =>
        entregas.CancelarAsync(request, cancellationToken);
}
