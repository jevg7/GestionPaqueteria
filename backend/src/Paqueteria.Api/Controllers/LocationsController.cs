using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Paqueteria.Api.Auth;
using Paqueteria.Api.DTOs;
using Paqueteria.Api.Services;

namespace Paqueteria.Api.Controllers;

/// <summary>
/// Ubicaciones de la agencia (bodegas en EE. UU., agencias en Nicaragua). Solo ADMIN; los demás
/// empleados ven las rutas activas en /api/catalogs. No hay DELETE: se desactivan.
/// </summary>
[ApiController]
[Route("api/locations")]
[Authorize(Roles = Permisos.AdministrarConfiguracion)]
[ProducesResponseType(StatusCodes.Status401Unauthorized)]
[ProducesResponseType(StatusCodes.Status403Forbidden)]
public sealed class LocationsController(UbicacionesService ubicaciones) : ControllerBase
{
    /// <summary>Todas, también las desactivadas.</summary>
    [HttpGet]
    [ProducesResponseType<List<LocationResponse>>(StatusCodes.Status200OK)]
    public Task<List<LocationResponse>> List(CancellationToken cancellationToken) => ubicaciones.UbicacionesAsync(cancellationToken);

    [HttpGet("{id:int}")]
    [ProducesResponseType<LocationResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<LocationResponse>> Get(int id, CancellationToken cancellationToken) =>
        await ubicaciones.UbicacionAsync(id, cancellationToken) is { } ubicacion ? ubicacion : NotFound();

    [HttpPost]
    [ProducesResponseType<LocationResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<LocationResponse>> Create(CreateLocationRequest request, CancellationToken cancellationToken)
    {
        var ubicacion = await ubicaciones.CrearUbicacionAsync(request, cancellationToken);
        return CreatedAtAction(nameof(Get), new { id = ubicacion.Id }, ubicacion);
    }

    /// <summary>Cambia el nombre. El código y el país no cambian.</summary>
    [HttpPut("{id:int}")]
    [ProducesResponseType<LocationResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<LocationResponse>> Update(int id, RenameRequest request, CancellationToken cancellationToken) =>
        await ubicaciones.RenombrarUbicacionAsync(id, request.Nombre, cancellationToken) is { } ubicacion ? ubicacion : NotFound();

    /// <summary>Solo si ninguna ruta activa la usa.</summary>
    [HttpPost("{id:int}/deactivate")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Deactivate(int id, CancellationToken cancellationToken) =>
        await ubicaciones.CambiarActivoUbicacionAsync(id, activo: false, cancellationToken) ? NoContent() : NotFound();

    [HttpPost("{id:int}/activate")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Activate(int id, CancellationToken cancellationToken) =>
        await ubicaciones.CambiarActivoUbicacionAsync(id, activo: true, cancellationToken) ? NoContent() : NotFound();
}

/// <summary>
/// Rutas de la agencia (EE. UU. → Nicaragua). Solo ADMIN; los demás empleados ven las activas en
/// /api/catalogs. No hay DELETE: una ruta desactivada no admite embarques nuevos.
/// </summary>
[ApiController]
[Route("api/routes")]
[Authorize(Roles = Permisos.AdministrarConfiguracion)]
[ProducesResponseType(StatusCodes.Status401Unauthorized)]
[ProducesResponseType(StatusCodes.Status403Forbidden)]
public sealed class RoutesController(UbicacionesService ubicaciones) : ControllerBase
{
    /// <summary>Todas, también las desactivadas.</summary>
    [HttpGet]
    [ProducesResponseType<List<RouteResponse>>(StatusCodes.Status200OK)]
    public Task<List<RouteResponse>> List(CancellationToken cancellationToken) => ubicaciones.RutasAsync(cancellationToken);

    [HttpGet("{id:int}")]
    [ProducesResponseType<RouteResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<RouteResponse>> Get(int id, CancellationToken cancellationToken) =>
        await ubicaciones.RutaAsync(id, cancellationToken) is { } ruta ? ruta : NotFound();

    [HttpPost]
    [ProducesResponseType<RouteResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<RouteResponse>> Create(CreateRouteRequest request, CancellationToken cancellationToken)
    {
        var ruta = await ubicaciones.CrearRutaAsync(request, cancellationToken);
        return CreatedAtAction(nameof(Get), new { id = ruta.Id }, ruta);
    }

    /// <summary>Cambia el nombre. Origen y destino no cambian: se crea otra ruta.</summary>
    [HttpPut("{id:int}")]
    [ProducesResponseType<RouteResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<RouteResponse>> Update(int id, RenameRequest request, CancellationToken cancellationToken) =>
        await ubicaciones.RenombrarRutaAsync(id, request.Nombre, cancellationToken) is { } ruta ? ruta : NotFound();

    [HttpPost("{id:int}/deactivate")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Deactivate(int id, CancellationToken cancellationToken) =>
        await ubicaciones.CambiarActivoRutaAsync(id, activo: false, cancellationToken) ? NoContent() : NotFound();

    /// <summary>Solo si su origen y su destino están activos.</summary>
    [HttpPost("{id:int}/activate")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Activate(int id, CancellationToken cancellationToken) =>
        await ubicaciones.CambiarActivoRutaAsync(id, activo: true, cancellationToken) ? NoContent() : NotFound();
}
