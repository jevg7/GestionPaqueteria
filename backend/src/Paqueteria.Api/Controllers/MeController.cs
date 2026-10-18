using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Paqueteria.Api.Auth;
using Paqueteria.Api.Data;
using Paqueteria.Api.DTOs;
using Paqueteria.Api.Services;

namespace Paqueteria.Api.Controllers;

/// <summary>
/// Quién inició sesión. Lo usa el frontend para saber quién es, a qué agencia pertenece y qué puede
/// hacer. Con un token válido que no da acceso responde 403 con el motivo en "detail".
/// </summary>
[ApiController]
[Route("api/me")]
[Authorize(Policy = Politicas.TokenValido)]
public sealed class MeController(PaqueteriaDbContext db, UsuarioActual usuarioActual) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<CurrentUserResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    public async Task<CurrentUserResponse> Get(CancellationToken cancellationToken)
    {
        if (usuarioActual.PlataformaId is { } plataformaId)
        {
            var propietario = await db.UsuariosPlataforma.AsNoTracking().SingleAsync(p => p.Id == plataformaId, cancellationToken);
            return new CurrentUserResponse("PLATAFORMA", propietario.Id, propietario.Nombres, propietario.Apellidos,
                propietario.Correo, usuarioActual.Roles, null);
        }

        if (!User.HasClaim(c => c.Type == ClaimsPaqueteria.UsuarioId))
        {
            throw new AccesoDenegadoException(User.FindFirstValue(ClaimsPaqueteria.EstadoAcceso) switch
            {
                EstadosAcceso.UsuarioInactivo => "Su usuario está desactivado. Consulte con el administrador de su agencia.",
                EstadosAcceso.AgenciaSuspendida => "Su agencia está suspendida. Contacte al soporte de la plataforma.",
                _ => "Su cuenta no pertenece a ninguna agencia de la plataforma. Pida al administrador de su agencia que lo invite.",
            });
        }

        var id = usuarioActual.Id;
        var usuario = await db.Usuarios.AsNoTracking()
            .Where(u => u.Id == id)
            .Select(u => new { u.Nombres, u.Apellidos, u.Correo, u.AgenciaId })
            .SingleAsync(cancellationToken);
        var agencia = await db.Agencias.AsNoTracking()
            .Where(a => a.Id == usuario.AgenciaId)
            .Select(a => new AgencyRef(a.Id, a.Nombre, a.Estado))
            .SingleAsync(cancellationToken);

        // Los roles son los mismos con los que se autorizó la solicitud.
        return new CurrentUserResponse("AGENCIA", id, usuario.Nombres, usuario.Apellidos, usuario.Correo, usuarioActual.Roles, agencia);
    }
}
