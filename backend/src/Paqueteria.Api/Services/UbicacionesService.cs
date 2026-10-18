using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Paqueteria.Api.Auth;
using Paqueteria.Api.Data;
using Paqueteria.Api.DTOs;
using Paqueteria.Api.Entities;
using Paqueteria.Api.Middleware;

namespace Paqueteria.Api.Services;

/// <summary>
/// Ubicaciones (bodegas en EE. UU., agencias en Nicaragua) y rutas entre ellas, administradas por el
/// ADMIN. Una ruta va siempre de EE. UU. a Nicaragua. Nada se borra: se desactiva. Una ruta
/// desactivada no admite embarques nuevos; los existentes siguen su flujo. Una ubicación solo se
/// desactiva si ninguna ruta activa la usa.
/// </summary>
public sealed class UbicacionesService(PaqueteriaDbContext db, UsuarioActual usuarioActual, ILogger<UbicacionesService> logger)
{
    private const string PaisOrigen = "US";
    private const string PaisDestino = "NI";

    private static readonly Expression<Func<Ubicacion, LocationResponse>> AUbicacion = u =>
        new LocationResponse(u.Id, u.Codigo, u.Nombre, u.Pais, u.Activo);

    private static readonly Expression<Func<Ruta, RouteResponse>> ARuta = r => new RouteResponse(
        r.Id, r.Nombre,
        new LocationResponse(r.Origen.Id, r.Origen.Codigo, r.Origen.Nombre, r.Origen.Pais, r.Origen.Activo),
        new LocationResponse(r.Destino.Id, r.Destino.Codigo, r.Destino.Nombre, r.Destino.Pais, r.Destino.Activo),
        r.Activo);

    public Task<List<LocationResponse>> UbicacionesAsync(CancellationToken cancellationToken) =>
        db.Ubicaciones.AsNoTracking().OrderBy(u => u.Pais == PaisOrigen ? 0 : 1).ThenBy(u => u.Codigo)
            .Select(AUbicacion).ToListAsync(cancellationToken);

    public Task<LocationResponse?> UbicacionAsync(int id, CancellationToken cancellationToken) =>
        db.Ubicaciones.AsNoTracking().Where(u => u.Id == id).Select(AUbicacion).SingleOrDefaultAsync(cancellationToken);

    public async Task<LocationResponse> CrearUbicacionAsync(CreateLocationRequest datos, CancellationToken cancellationToken)
    {
        var ubicacion = new Ubicacion
        {
            Codigo = datos.Codigo.Trim().ToUpperInvariant(),
            Nombre = datos.Nombre.Trim(),
            Pais = datos.Pais.Trim().ToUpperInvariant(),
        };
        db.Ubicaciones.Add(ubicacion);
        await GuardarAsync(cancellationToken);
        logger.LogInformation("Ubicación {UbicacionId} ({Codigo}) creada por el usuario {UsuarioId}.", ubicacion.Id, ubicacion.Codigo, usuarioActual.Id);
        return (await UbicacionAsync(ubicacion.Id, cancellationToken))!;
    }

    public async Task<LocationResponse?> RenombrarUbicacionAsync(int id, string nombre, CancellationToken cancellationToken)
    {
        var ubicacion = await db.Ubicaciones.SingleOrDefaultAsync(u => u.Id == id, cancellationToken);
        if (ubicacion is null)
        {
            return null;
        }
        ubicacion.Nombre = nombre.Trim();
        await db.SaveChangesAsync(cancellationToken);
        return await UbicacionAsync(id, cancellationToken);
    }

    /// <summary>Activa o desactiva. Es idempotente. False si no existe.</summary>
    public async Task<bool> CambiarActivoUbicacionAsync(int id, bool activo, CancellationToken cancellationToken)
    {
        var ubicacion = await db.Ubicaciones.SingleOrDefaultAsync(u => u.Id == id, cancellationToken);
        if (ubicacion is null)
        {
            return false;
        }
        if (ubicacion.Activo == activo)
        {
            return true;
        }
        if (!activo && await db.Rutas.AnyAsync(r => r.Activo && (r.OrigenId == id || r.DestinoId == id), cancellationToken))
        {
            throw new ConflictoException($"La ubicación {ubicacion.Codigo} está en rutas activas. Desactive primero esas rutas.");
        }
        ubicacion.Activo = activo;
        await db.SaveChangesAsync(cancellationToken);
        logger.LogInformation("Ubicación {UbicacionId} {Accion} por el usuario {UsuarioId}.",
            id, activo ? "reactivada" : "desactivada", usuarioActual.Id);
        return true;
    }

    public Task<List<RouteResponse>> RutasAsync(CancellationToken cancellationToken) =>
        db.Rutas.AsNoTracking().OrderBy(r => r.Nombre).ThenBy(r => r.Id).Select(ARuta).ToListAsync(cancellationToken);

    public Task<RouteResponse?> RutaAsync(int id, CancellationToken cancellationToken) =>
        db.Rutas.AsNoTracking().Where(r => r.Id == id).Select(ARuta).SingleOrDefaultAsync(cancellationToken);

    public async Task<RouteResponse> CrearRutaAsync(CreateRouteRequest datos, CancellationToken cancellationToken)
    {
        var origen = await UbicacionActivaAsync(datos.OrigenId, "origen", cancellationToken);
        var destino = await UbicacionActivaAsync(datos.DestinoId, "destino", cancellationToken);
        if (origen.Pais != PaisOrigen || destino.Pais != PaisDestino)
        {
            throw new SolicitudInvalidaException("Una ruta va de una ubicación en EE. UU. (US) a una en Nicaragua (NI).");
        }

        var ruta = new Ruta { OrigenId = origen.Id, DestinoId = destino.Id, Nombre = datos.Nombre.Trim() };
        db.Rutas.Add(ruta);
        await GuardarAsync(cancellationToken);
        logger.LogInformation("Ruta {RutaId} ({Origen} → {Destino}) creada por el usuario {UsuarioId}.",
            ruta.Id, origen.Codigo, destino.Codigo, usuarioActual.Id);
        return (await RutaAsync(ruta.Id, cancellationToken))!;
    }

    public async Task<RouteResponse?> RenombrarRutaAsync(int id, string nombre, CancellationToken cancellationToken)
    {
        var ruta = await db.Rutas.SingleOrDefaultAsync(r => r.Id == id, cancellationToken);
        if (ruta is null)
        {
            return null;
        }
        ruta.Nombre = nombre.Trim();
        await db.SaveChangesAsync(cancellationToken);
        return await RutaAsync(id, cancellationToken);
    }

    /// <summary>Activa o desactiva. Es idempotente. False si no existe.</summary>
    public async Task<bool> CambiarActivoRutaAsync(int id, bool activo, CancellationToken cancellationToken)
    {
        var ruta = await db.Rutas.Include(r => r.Origen).Include(r => r.Destino).SingleOrDefaultAsync(r => r.Id == id, cancellationToken);
        if (ruta is null)
        {
            return false;
        }
        if (ruta.Activo == activo)
        {
            return true;
        }
        if (activo && (!ruta.Origen.Activo || !ruta.Destino.Activo))
        {
            throw new ConflictoException(
                $"La ruta usa una ubicación desactivada ({(ruta.Origen.Activo ? ruta.Destino.Codigo : ruta.Origen.Codigo)}). Actívela primero.");
        }
        ruta.Activo = activo;
        await db.SaveChangesAsync(cancellationToken);
        logger.LogInformation("Ruta {RutaId} {Accion} por el usuario {UsuarioId}.", id, activo ? "reactivada" : "desactivada", usuarioActual.Id);
        return true;
    }

    private async Task<Ubicacion> UbicacionActivaAsync(int id, string papel, CancellationToken cancellationToken)
    {
        var ubicacion = await db.Ubicaciones.AsNoTracking().SingleOrDefaultAsync(u => u.Id == id, cancellationToken)
            ?? throw new SolicitudInvalidaException($"La ubicación de {papel} {id} no existe.");
        return ubicacion.Activo
            ? ubicacion
            : throw new ConflictoException($"La ubicación {ubicacion.Codigo} está desactivada.");
    }

    private async Task GuardarAsync(CancellationToken cancellationToken)
    {
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (Unico(ex) == "uq_ubicaciones_codigo")
        {
            throw new ConflictoException("Ya existe una ubicación con ese código.");
        }
        catch (DbUpdateException ex) when (Unico(ex) == "uq_rutas_origen_destino")
        {
            throw new ConflictoException("Ya existe una ruta con ese origen y destino.");
        }
    }

    private static string? Unico(DbUpdateException ex) =>
        PostgresExceptionMapper.Find(ex) is { SqlState: PostgresErrorCodes.UniqueViolation } unico ? unico.ConstraintName : null;
}
