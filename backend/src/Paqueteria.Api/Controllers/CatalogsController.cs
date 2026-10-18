using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Paqueteria.Api.Data;
using Paqueteria.Api.DTOs;

namespace Paqueteria.Api.Controllers;

/// <summary>
/// Catálogos para los formularios (métodos de envío, rutas, estados del paquete). Solo lectura y solo
/// registros activos; cualquier empleado activo (política por defecto).
/// </summary>
[ApiController]
[Route("api/catalogs")]
public sealed class CatalogsController(PaqueteriaDbContext db) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<CatalogsResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<CatalogsResponse> Get(CancellationToken cancellationToken)
    {
        var metodos = await db.MetodosEnvio.AsNoTracking()
            .Where(m => m.Activo)
            .OrderBy(m => m.Id)
            .Select(m => new ShippingMethodCatalogItem(m.Codigo, m.Nombre, m.PrefijoEmbarque))
            .ToListAsync(cancellationToken);
        var rutas = await db.Rutas.AsNoTracking()
            .Where(r => r.Activo)
            .OrderBy(r => r.Id)
            .Select(r => new RouteRef(r.Id, r.Nombre, r.Origen.Codigo, r.Destino.Codigo))
            .ToListAsync(cancellationToken);
        var estados = await db.EstadosPaquete.AsNoTracking()
            .OrderBy(e => e.Orden)
            .Select(e => new PackageStateCatalogItem((short)e.Id, e.Codigo, e.Nombre, e.Orden, e.EsFinal))
            .ToListAsync(cancellationToken);

        return new CatalogsResponse(metodos, rutas, estados);
    }
}
