using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Paqueteria.Api.Auth;
using Paqueteria.Api.DTOs;
using Paqueteria.Api.Services;

namespace Paqueteria.Api.Controllers;

/// <summary>
/// Empleados de la agencia y sus roles. Solo ADMIN. El alta envía una invitación por correo (Supabase
/// Auth); sin Supabase configurado responde 503. No hay DELETE: un usuario se desactiva.
/// </summary>
[ApiController]
[Route("api/users")]
[Authorize(Roles = Permisos.AdministrarUsuarios)]
[ProducesResponseType(StatusCodes.Status401Unauthorized)]
[ProducesResponseType(StatusCodes.Status403Forbidden)]
public sealed class UsersController(UsuariosService usuarios) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<PagedResponse<UserResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public Task<PagedResponse<UserResponse>> Search([FromQuery] UserSearchQuery query, CancellationToken cancellationToken) =>
        usuarios.BuscarAsync(query, cancellationToken);

    /// <summary>Roles que se pueden asignar a un empleado.</summary>
    [HttpGet("roles")]
    [ProducesResponseType<List<RoleResponse>>(StatusCodes.Status200OK)]
    public Task<List<RoleResponse>> Roles(CancellationToken cancellationToken) => usuarios.RolesAsync(cancellationToken);

    [HttpGet("{id:long}")]
    [ProducesResponseType<UserResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<UserResponse>> Get(long id, CancellationToken cancellationToken) =>
        await usuarios.ObtenerAsync(id, cancellationToken) is { } usuario ? usuario : NotFound();

    /// <summary>Crea el empleado con sus roles y le envía la invitación para crear su contraseña.</summary>
    [HttpPost]
    [ProducesResponseType<UserResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<UserResponse>> Create(CreateUserRequest request, CancellationToken cancellationToken)
    {
        var usuario = await usuarios.CrearAsync(request, cancellationToken);
        return CreatedAtAction(nameof(Get), new { id = usuario.Id }, usuario);
    }

    /// <summary>Reemplaza nombres, teléfono y roles. El correo no cambia.</summary>
    [HttpPut("{id:long}")]
    [ProducesResponseType<UserResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<UserResponse>> Update(long id, UpdateUserRequest request, CancellationToken cancellationToken) =>
        await usuarios.ActualizarAsync(id, request, cancellationToken) is { } usuario ? usuario : NotFound();

    /// <summary>Quita el acceso de inmediato (su siguiente solicitud responde 403).</summary>
    [HttpPost("{id:long}/deactivate")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Deactivate(long id, CancellationToken cancellationToken) =>
        await usuarios.CambiarActivoAsync(id, activo: false, cancellationToken) ? NoContent() : NotFound();

    [HttpPost("{id:long}/activate")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Activate(long id, CancellationToken cancellationToken) =>
        await usuarios.CambiarActivoAsync(id, activo: true, cancellationToken) ? NoContent() : NotFound();

    /// <summary>Reenvía la invitación a quien todavía no la aceptó (el enlace vence).</summary>
    [HttpPost("{id:long}/resend-invite")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> ResendInvite(long id, CancellationToken cancellationToken) =>
        await usuarios.ReenviarInvitacionAsync(id, cancellationToken) ? NoContent() : NotFound();
}
