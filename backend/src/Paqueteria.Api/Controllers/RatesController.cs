using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Paqueteria.Api.Auth;
using Paqueteria.Api.DTOs;
using Paqueteria.Api.Services;

namespace Paqueteria.Api.Controllers;

/// <summary>
/// Tarifas de envío de la agencia. Consultan ADMIN, AGENTE y BODEGA; registra y anula solo ADMIN.
/// No hay edición ni DELETE: una tarifa se reemplaza por otra nueva o se anula.
/// </summary>
[ApiController]
[Route("api/rates")]
[Authorize(Roles = Permisos.LeerTarifas)]
[ProducesResponseType(StatusCodes.Status401Unauthorized)]
[ProducesResponseType(StatusCodes.Status403Forbidden)]
public sealed class RatesController(TarifasService tarifas) : ControllerBase
{
    /// <summary>Historial de tarifas, por método y de la más reciente a la más antigua.</summary>
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<RateResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public Task<IReadOnlyList<RateResponse>> List([FromQuery] RateSearchQuery query, CancellationToken cancellationToken) =>
        tarifas.ListarAsync(query, cancellationToken);

    /// <summary>La tarifa de hoy de cada método de envío (null si falta: no se podrá pesar).</summary>
    [HttpGet("current")]
    [ProducesResponseType<IReadOnlyList<CurrentRateResponse>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<CurrentRateResponse>> Current(CancellationToken cancellationToken) =>
        tarifas.VigentesAsync(cancellationToken);

    [HttpGet("{id:int}")]
    [ProducesResponseType<RateResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<RateResponse>> Get(int id, CancellationToken cancellationToken) =>
        await tarifas.ObtenerAsync(id, cancellationToken) is { } tarifa ? tarifa : NotFound();

    /// <summary>Registra una tarifa desde hoy o una fecha futura; cierra la anterior el día previo.</summary>
    [HttpPost]
    [Authorize(Roles = Permisos.AdministrarConfiguracion)]
    [ProducesResponseType<RateResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<RateResponse>> Create(CreateRateRequest request, CancellationToken cancellationToken)
    {
        var tarifa = await tarifas.CrearAsync(request, cancellationToken);
        return CreatedAtAction(nameof(Get), new { id = tarifa.Id }, tarifa);
    }

    /// <summary>Anula una tarifa programada, o vigente sin paquetes; la anterior vuelve a regir.</summary>
    [HttpPost("{id:int}/void")]
    [Authorize(Roles = Permisos.AdministrarConfiguracion)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Void(int id, CancellationToken cancellationToken) =>
        await tarifas.AnularAsync(id, cancellationToken) ? NoContent() : NotFound();
}
