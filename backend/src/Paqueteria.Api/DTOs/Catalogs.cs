namespace Paqueteria.Api.DTOs;

/// <summary>Catálogos para los formularios del frontend (solo lectura, solo registros activos).</summary>
public sealed record CatalogsResponse(
    IReadOnlyList<ShippingMethodCatalogItem> MetodosEnvio,
    IReadOnlyList<RouteRef> Rutas,
    IReadOnlyList<PackageStateCatalogItem> EstadosPaquete);

public sealed record ShippingMethodCatalogItem(string Codigo, string Nombre, string PrefijoEmbarque);

public sealed record PackageStateCatalogItem(short Id, string Codigo, string Nombre, short Orden, bool EsFinal);
