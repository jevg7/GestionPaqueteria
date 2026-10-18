using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Paqueteria.Api.Auth;
using Paqueteria.Api.DTOs;
using Paqueteria.Api.Services;

namespace Paqueteria.Api.Controllers;

/// <summary>
/// Paquetes: registro, consulta, edición y las transiciones de este módulo (recepción en Miami,
/// pesaje, cancelación). Las demás transiciones llegan con embarques, pagos y entregas.
/// Las reglas de estado responden 409 con el motivo en "detail".
/// </summary>
[ApiController]
[Route("api/packages")]
[Authorize(Roles = Permisos.LeerPaquetes)]
[ProducesResponseType(StatusCodes.Status401Unauthorized)]
[ProducesResponseType(StatusCodes.Status403Forbidden)]
public sealed class PackagesController(PaquetesService paquetes) : ControllerBase
{
    /// <summary>Busca por código, tracking o descripción; filtra por estado, cliente y método. Más recientes primero.</summary>
    [HttpGet]
    [ProducesResponseType<PagedResponse<PackageResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public Task<PagedResponse<PackageResponse>> Search([FromQuery] PackageSearchQuery query, CancellationToken cancellationToken) =>
        paquetes.BuscarAsync(query, cancellationToken);

    [HttpGet("{id:long}")]
    [ProducesResponseType<PackageResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<PackageResponse>> Get(long id, CancellationToken cancellationToken) =>
        await paquetes.ObtenerAsync(id, cancellationToken) is { } paquete ? paquete : NotFound();

    /// <summary>Historial de estados: quién hizo cada cambio y cuándo.</summary>
    [HttpGet("{id:long}/history")]
    [ProducesResponseType<IReadOnlyList<PackageHistoryEntry>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<IReadOnlyList<PackageHistoryEntry>>> History(long id, CancellationToken cancellationToken) =>
        await paquetes.HistorialAsync(id, cancellationToken) is { } historial ? Ok(historial) : NotFound();

    /// <summary>Registra el paquete que avisó el cliente. Nace en REGISTRADO; el código lo asigna la BD.</summary>
    [HttpPost]
    [Authorize(Roles = Permisos.GestionarPaquetes)]
    [ProducesResponseType<PackageResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<PackageResponse>> Create(PackageRequest request, CancellationToken cancellationToken)
    {
        var paquete = await paquetes.RegistrarAsync(request, cancellationToken);
        return CreatedAtAction(nameof(Get), new { id = paquete.Id }, paquete);
    }

    /// <summary>Reemplaza tracking, tienda y descripción; cliente y método solo antes de asignarse a un embarque.</summary>
    [HttpPut("{id:long}")]
    [Authorize(Roles = Permisos.GestionarPaquetes)]
    [ProducesResponseType<PackageResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<PackageResponse>> Update(long id, PackageRequest request, CancellationToken cancellationToken) =>
        await paquetes.ActualizarAsync(id, request, cancellationToken) is { } paquete ? paquete : NotFound();

    /// <summary>REGISTRADO → RECIBIDO_EN_MIAMI: el paquete llegó a la bodega.</summary>
    [HttpPost("{id:long}/receive-miami")]
    [Authorize(Roles = Permisos.OperarBodega)]
    [ProducesResponseType<PackageResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<PackageResponse>> ReceiveMiami(
        long id,
        [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] ReceivePackageRequest? request,
        CancellationToken cancellationToken) =>
        await paquetes.RecibirEnMiamiAsync(id, request?.Observacion, cancellationToken) is { } paquete ? paquete : NotFound();

    /// <summary>
    /// Registra el peso y calcula el monto con la tarifa vigente del día. RECIBIDO_EN_NICARAGUA →
    /// PENDIENTE_DE_PAGO; en PENDIENTE_DE_PAGO sin factura, corrige el peso y recalcula.
    /// </summary>
    [HttpPost("{id:long}/weigh")]
    [Authorize(Roles = Permisos.OperarBodega)]
    [ProducesResponseType<PackageResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<PackageResponse>> Weigh(long id, WeighPackageRequest request, CancellationToken cancellationToken) =>
        await paquetes.PesarAsync(id, request.PesoLb, cancellationToken) is { } paquete ? paquete : NotFound();

    /// <summary>
    /// → LISTO_PARA_ENTREGA: desde PAGADO, o desde PENDIENTE_DE_PAGO con factura emitida (pago contra entrega).
    /// </summary>
    [HttpPost("{id:long}/ready")]
    [Authorize(Roles = Permisos.PrepararEntrega)]
    [ProducesResponseType<PackageResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<PackageResponse>> Ready(long id, CancellationToken cancellationToken) =>
        await paquetes.PrepararEntregaAsync(id, cancellationToken) is { } paquete ? paquete : NotFound();

    /// <summary>Cancela desde REGISTRADO, RECIBIDO_EN_MIAMI o PENDIENTE_DE_ENVIO (se quita del embarque).</summary>
    [HttpPost("{id:long}/cancel")]
    [Authorize(Roles = Permisos.GestionarPaquetes)]
    [ProducesResponseType<PackageResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<PackageResponse>> Cancel(long id, CancelPackageRequest request, CancellationToken cancellationToken) =>
        await paquetes.CancelarAsync(id, request.Motivo, cancellationToken) is { } paquete ? paquete : NotFound();
}
