using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Paqueteria.Api.Auth;
using Paqueteria.Api.DTOs;
using Paqueteria.Api.Services;

namespace Paqueteria.Api.Controllers;

/// <summary>
/// Clientes de la agencia. Consultan ADMIN, AGENTE y BODEGA; registran y editan ADMIN y AGENTE.
/// No hay DELETE: un cliente se desactiva.
/// </summary>
[ApiController]
[Route("api/clients")]
[Authorize(Roles = Permisos.LeerClientes)]
[ProducesResponseType(StatusCodes.Status401Unauthorized)]
[ProducesResponseType(StatusCodes.Status403Forbidden)]
public sealed class ClientsController(ClientesService clientes) : ControllerBase
{
    /// <summary>Busca clientes por nombre, teléfono, correo o código, paginado y ordenado por apellidos.</summary>
    [HttpGet]
    [ProducesResponseType<PagedResponse<ClientResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public Task<PagedResponse<ClientResponse>> Search([FromQuery] ClientSearchQuery query, CancellationToken cancellationToken) =>
        clientes.BuscarAsync(query, cancellationToken);

    [HttpGet("{id:long}")]
    [ProducesResponseType<ClientResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ClientResponse>> Get(long id, CancellationToken cancellationToken) =>
        await clientes.ObtenerAsync(id, cancellationToken) is { } cliente ? cliente : NotFound();

    /// <summary>Registra un cliente. El código (CLI-000001) lo asigna la base de datos.</summary>
    [HttpPost]
    [Authorize(Roles = Permisos.EscribirClientes)]
    [ProducesResponseType<ClientResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<ClientResponse>> Create(ClientRequest request, CancellationToken cancellationToken)
    {
        var cliente = await clientes.CrearAsync(request, cancellationToken);
        return CreatedAtAction(nameof(Get), new { id = cliente.Id }, cliente);
    }

    /// <summary>Reemplaza los datos del cliente (no cambia su código ni su estado activo).</summary>
    [HttpPut("{id:long}")]
    [Authorize(Roles = Permisos.EscribirClientes)]
    [ProducesResponseType<ClientResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ClientResponse>> Update(long id, ClientRequest request, CancellationToken cancellationToken) =>
        await clientes.ActualizarAsync(id, request, cancellationToken) is { } cliente ? cliente : NotFound();

    /// <summary>Desactiva el cliente: ya no se le podrán registrar paquetes. Sus paquetes en curso siguen.</summary>
    [HttpPost("{id:long}/deactivate")]
    [Authorize(Roles = Permisos.EscribirClientes)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Deactivate(long id, CancellationToken cancellationToken) =>
        await clientes.CambiarActivoAsync(id, activo: false, cancellationToken) ? NoContent() : NotFound();

    [HttpPost("{id:long}/activate")]
    [Authorize(Roles = Permisos.EscribirClientes)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Activate(long id, CancellationToken cancellationToken) =>
        await clientes.CambiarActivoAsync(id, activo: true, cancellationToken) ? NoContent() : NotFound();
}
