using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Paqueteria.Api.Auth;
using Paqueteria.Api.Data;
using Paqueteria.Api.DTOs;
using Paqueteria.Api.Entities;
using Paqueteria.Api.Services;

namespace Paqueteria.Api.Controllers;

/// <summary>
/// Auditoría: quién cambió qué, cuándo y desde dónde. La escribe la BD (trigger fn_auditar); aquí solo
/// se consulta. Solo ADMIN: contiene datos personales y financieros de todos los clientes.
/// </summary>
[ApiController]
[Route("api/audit-logs")]
[Authorize(Roles = Permisos.VerAuditoria)]
[ProducesResponseType(StatusCodes.Status401Unauthorized)]
[ProducesResponseType(StatusCodes.Status403Forbidden)]
public sealed class AuditLogsController(PaqueteriaDbContext db) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<PagedResponse<AuditLogResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<PagedResponse<AuditLogResponse>> Search([FromQuery] AuditLogSearchQuery filtro, CancellationToken cancellationToken)
    {
        var consulta = db.AuditLogs.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(filtro.Tabla))
        {
            var tabla = filtro.Tabla.Trim().ToLowerInvariant();
            consulta = consulta.Where(a => a.Tabla == tabla);
        }
        if (!string.IsNullOrWhiteSpace(filtro.RegistroId))
        {
            var registro = filtro.RegistroId.Trim();
            consulta = consulta.Where(a => a.RegistroId == registro);
        }
        if (filtro.UsuarioId is { } usuarioId)
        {
            consulta = consulta.Where(a => a.UsuarioId == usuarioId);
        }
        if (!string.IsNullOrWhiteSpace(filtro.Accion))
        {
            var accion = UpperSnakeEnum<AccionAuditoria>.DesdeTextoDeUsuario(filtro.Accion)
                ?? throw new SolicitudInvalidaException($"La acción '{filtro.Accion}' no existe (INSERT, UPDATE o DELETE).");
            consulta = consulta.Where(a => a.Accion == accion);
        }
        if (filtro.Desde is { } desde)
        {
            var desdeUtc = desde.ToUniversalTime();
            consulta = consulta.Where(a => a.Fecha >= desdeUtc);
        }
        if (filtro.Hasta is { } hasta)
        {
            var hastaUtc = hasta.ToUniversalTime();
            consulta = consulta.Where(a => a.Fecha <= hastaUtc);
        }

        var total = await consulta.CountAsync(cancellationToken);
        var filas = await (
            from a in consulta
            join u in db.Usuarios on a.UsuarioId equals u.Id into usuarios
            from u in usuarios.DefaultIfEmpty()
            orderby a.Id descending
            select new { Log = a, Usuario = u != null ? u.Nombres + " " + u.Apellidos : null })
            .Skip((filtro.Page - 1) * filtro.PageSize)
            .Take(filtro.PageSize)
            .ToListAsync(cancellationToken);

        var items = filas.Select(f => new AuditLogResponse(
            f.Log.Id, f.Log.Fecha, f.Log.UsuarioId, f.Usuario, f.Log.Tabla, f.Log.RegistroId, f.Log.Accion,
            Json(f.Log.ValoresAnteriores), Json(f.Log.ValoresNuevos), f.Log.Origen, f.Log.TraceId)).ToList();
        return new PagedResponse<AuditLogResponse>(items, filtro.Page, filtro.PageSize, total);
    }

    private static JsonElement? Json(string? valor)
    {
        if (valor is null)
        {
            return null;
        }
        using var documento = JsonDocument.Parse(valor);
        return documento.RootElement.Clone();
    }
}
