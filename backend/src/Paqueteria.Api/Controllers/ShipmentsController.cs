using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Paqueteria.Api.Auth;
using Paqueteria.Api.DTOs;
using Paqueteria.Api.Services;

namespace Paqueteria.Api.Controllers;

/// <summary>
/// Embarques: ABIERTO → CERRADO → EN_TRANSITO → RECIBIDO (o CANCELADO sin paquetes). Consultan
/// ADMIN, AGENTE y BODEGA; operan ADMIN y BODEGA. Las reglas de estado responden 409 con el motivo.
/// </summary>
[ApiController]
[Route("api/shipments")]
[Authorize(Roles = Permisos.LeerEmbarques)]
[ProducesResponseType(StatusCodes.Status401Unauthorized)]
[ProducesResponseType(StatusCodes.Status403Forbidden)]
public sealed class ShipmentsController(EmbarquesService embarques) : ControllerBase
{
    /// <summary>Busca por código; filtra por estado y método. Más recientes primero.</summary>
    [HttpGet]
    [ProducesResponseType<PagedResponse<ShipmentResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public Task<PagedResponse<ShipmentResponse>> Search([FromQuery] ShipmentSearchQuery query, CancellationToken cancellationToken) =>
        embarques.BuscarAsync(query, cancellationToken);

    [HttpGet("{id:long}")]
    [ProducesResponseType<ShipmentResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ShipmentResponse>> Get(long id, CancellationToken cancellationToken) =>
        await embarques.ObtenerAsync(id, cancellationToken) is { } embarque ? embarque : NotFound();

    [HttpGet("{id:long}/packages")]
    [ProducesResponseType<IReadOnlyList<PackageResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<IReadOnlyList<PackageResponse>>> Packages(long id, CancellationToken cancellationToken) =>
        await embarques.PaquetesAsync(id, cancellationToken) is { } lista ? Ok(lista) : NotFound();

    /// <summary>Crea un embarque ABIERTO. El código (AIR-2026-0001) lo asigna la BD. Rutas en GET /api/catalogs.</summary>
    [HttpPost]
    [Authorize(Roles = Permisos.OperarBodega)]
    [ProducesResponseType<ShipmentResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<ShipmentResponse>> Create(CreateShipmentRequest request, CancellationToken cancellationToken)
    {
        var embarque = await embarques.CrearAsync(request, cancellationToken);
        return CreatedAtAction(nameof(Get), new { id = embarque.Id }, embarque);
    }

    /// <summary>Fecha estimada de llegada y observaciones, mientras no haya llegado ni se haya cancelado.</summary>
    [HttpPut("{id:long}")]
    [Authorize(Roles = Permisos.OperarBodega)]
    [ProducesResponseType<ShipmentResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<ShipmentResponse>> Update(long id, UpdateShipmentRequest request, CancellationToken cancellationToken) =>
        await embarques.ActualizarAsync(id, request, cancellationToken) is { } embarque ? embarque : NotFound();

    /// <summary>Asigna paquetes RECIBIDO_EN_MIAMI del mismo método (→ PENDIENTE_DE_ENVIO). Todo o nada.</summary>
    [HttpPost("{id:long}/packages")]
    [Authorize(Roles = Permisos.OperarBodega)]
    [ProducesResponseType<ShipmentResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<ShipmentResponse>> AssignPackages(long id, AssignPackagesRequest request, CancellationToken cancellationToken) =>
        await embarques.AsignarAsync(id, request.PaqueteIds, cancellationToken) is { } embarque ? embarque : NotFound();

    /// <summary>Quita un paquete de un embarque ABIERTO (vuelve a RECIBIDO_EN_MIAMI). No borra nada.</summary>
    [HttpPost("{id:long}/packages/{paqueteId:long}/remove")]
    [Authorize(Roles = Permisos.OperarBodega)]
    [ProducesResponseType<ShipmentResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<ShipmentResponse>> RemovePackage(long id, long paqueteId, CancellationToken cancellationToken) =>
        await embarques.QuitarPaqueteAsync(id, paqueteId, cancellationToken) is { } embarque ? embarque : NotFound();

    /// <summary>ABIERTO → CERRADO. Necesita al menos un paquete; no se reabre.</summary>
    [HttpPost("{id:long}/close")]
    [Authorize(Roles = Permisos.OperarBodega)]
    [ProducesResponseType<ShipmentResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<ShipmentResponse>> Close(long id, CancellationToken cancellationToken) =>
        await embarques.CerrarAsync(id, cancellationToken) is { } embarque ? embarque : NotFound();

    /// <summary>CERRADO → EN_TRANSITO con todos sus paquetes. Fecha opcional (por defecto ahora; nunca futura).</summary>
    [HttpPost("{id:long}/depart")]
    [Authorize(Roles = Permisos.OperarBodega)]
    [ProducesResponseType<ShipmentResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<ShipmentResponse>> Depart(
        long id,
        [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] ShipmentEventRequest? request,
        CancellationToken cancellationToken) =>
        await embarques.RegistrarSalidaAsync(id, request?.Fecha, cancellationToken) is { } embarque ? embarque : NotFound();

    /// <summary>EN_TRANSITO → RECIBIDO; sus paquetes pasan a RECIBIDO_EN_NICARAGUA con esa fecha.</summary>
    [HttpPost("{id:long}/arrive")]
    [Authorize(Roles = Permisos.OperarBodega)]
    [ProducesResponseType<ShipmentResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<ShipmentResponse>> Arrive(
        long id,
        [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] ShipmentEventRequest? request,
        CancellationToken cancellationToken) =>
        await embarques.RegistrarLlegadaAsync(id, request?.Fecha, cancellationToken) is { } embarque ? embarque : NotFound();

    /// <summary>ABIERTO o CERRADO → CANCELADO, solo sin paquetes.</summary>
    [HttpPost("{id:long}/cancel")]
    [Authorize(Roles = Permisos.OperarBodega)]
    [ProducesResponseType<ShipmentResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<ShipmentResponse>> Cancel(long id, CancellationToken cancellationToken) =>
        await embarques.CancelarAsync(id, cancellationToken) is { } embarque ? embarque : NotFound();
}
