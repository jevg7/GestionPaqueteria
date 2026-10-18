using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Paqueteria.Api.Auth;
using Paqueteria.Api.DTOs;
using Paqueteria.Api.Entities;
using Paqueteria.Api.Services;

namespace Paqueteria.Api.Controllers;

/// <summary>
/// Panel del dueño de la plataforma: alta, edición y suspensión de agencias. Solo rol PLATAFORMA; los
/// empleados de las agencias reciben 403. No hay DELETE: una agencia se suspende.
/// </summary>
[ApiController]
[Route("api/platform/agencies")]
[Authorize(Roles = CodigosRol.Plataforma)]
[ProducesResponseType(StatusCodes.Status401Unauthorized)]
[ProducesResponseType(StatusCodes.Status403Forbidden)]
public sealed class PlatformAgenciesController(AgenciasService agencias) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<PagedResponse<AgencyResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public Task<PagedResponse<AgencyResponse>> Search([FromQuery] AgencySearchQuery query, CancellationToken cancellationToken) =>
        agencias.BuscarAsync(query, cancellationToken);

    [HttpGet("{id:long}")]
    [ProducesResponseType<AgencyResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<AgencyResponse>> Get(long id, CancellationToken cancellationToken) =>
        await agencias.ObtenerAsync(id, cancellationToken) is { } agencia ? agencia : NotFound();

    /// <summary>Crea la agencia (con MIA, MGA y la ruta Miami → Managua) e invita a su primer ADMIN.</summary>
    [HttpPost]
    [ProducesResponseType<AgencyResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<AgencyResponse>> Create(CreateAgencyRequest request, CancellationToken cancellationToken)
    {
        var agencia = await agencias.CrearAsync(request, cancellationToken);
        return CreatedAtAction(nameof(Get), new { id = agencia.Id }, agencia);
    }

    [HttpPut("{id:long}")]
    [ProducesResponseType<AgencyResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<AgencyResponse>> Update(long id, AgencyRequest request, CancellationToken cancellationToken) =>
        await agencias.ActualizarAsync(id, request, cancellationToken) is { } agencia ? agencia : NotFound();

    /// <summary>Sus usuarios pierden el acceso de inmediato; los datos se conservan.</summary>
    [HttpPost("{id:long}/suspend")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Suspend(long id, CancellationToken cancellationToken) =>
        await agencias.CambiarEstadoAsync(id, EstadoAgencia.Suspendida, cancellationToken) ? NoContent() : NotFound();

    [HttpPost("{id:long}/activate")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Activate(long id, CancellationToken cancellationToken) =>
        await agencias.CambiarEstadoAsync(id, EstadoAgencia.Activa, cancellationToken) ? NoContent() : NotFound();
}
