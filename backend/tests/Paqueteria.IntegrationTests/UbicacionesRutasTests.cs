using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Paqueteria.Api.Auth;
using Paqueteria.Api.DTOs;
using Paqueteria.IntegrationTests.Infrastructure;

namespace Paqueteria.IntegrationTests;

/// <summary>Ubicaciones y rutas por HTTP. seed.sql deja MIA (US), MGA (NI) y la ruta Miami → Managua.</summary>
public class UbicacionesRutasTests(ServidorPostgres servidor) : PruebaHttpConBaseDeDatos(servidor)
{
    [Fact]
    public async Task CrearUbicacionYRutaQueApareceEnLosCatalogos()
    {
        using var admin = await ComoAsync(CodigosRol.Admin);
        var mia = await UbicacionAsync(admin, "MIA");

        var leon = await CrearUbicacionAsync(admin, " leo ", " Agencia León ", "ni");
        Assert.Equal(("LEO", "Agencia León", "NI", true), (leon.Codigo, leon.Nombre, leon.Pais, leon.Activo));

        using var response = await admin.PostAsJsonAsync("/api/routes",
            new { origenId = mia.Id, destinoId = leon.Id, nombre = "Miami → León" }, Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var ruta = await Leer<RouteResponse>(response);
        Assert.Equal(("MIA", "LEO"), (ruta.Origen.Codigo, ruta.Destino.Codigo));
        var catalogos = await admin.GetFromJsonAsync<CatalogsResponse>("/api/catalogs", JsonApi.Opciones, Ct);
        Assert.Contains(catalogos!.Rutas, r => r.Id == ruta.Id && r.Nombre == "Miami → León");
    }

    [Fact]
    public async Task CodigoRepetidoYRutaRepetidaResponden409()
    {
        using var admin = await ComoAsync(CodigosRol.Admin);
        var mia = await UbicacionAsync(admin, "MIA");
        var mga = await UbicacionAsync(admin, "MGA");

        using (var codigo = await admin.PostAsJsonAsync("/api/locations", new { codigo = "mia", nombre = "Otra", pais = "US" }, Ct))
        {
            await AssertProblema(codigo, HttpStatusCode.Conflict, "Ya existe una ubicación con ese código");
        }
        using var ruta = await admin.PostAsJsonAsync("/api/routes", new { origenId = mia.Id, destinoId = mga.Id, nombre = "Otra" }, Ct);
        await AssertProblema(ruta, HttpStatusCode.Conflict, "Ya existe una ruta con ese origen y destino");
    }

    [Fact]
    public async Task UnaRutaVaDeEstadosUnidosANicaragua()
    {
        using var admin = await ComoAsync(CodigosRol.Admin);
        var mia = await UbicacionAsync(admin, "MIA");
        var mga = await UbicacionAsync(admin, "MGA");

        using var alReves = await admin.PostAsJsonAsync("/api/routes", new { origenId = mga.Id, destinoId = mia.Id, nombre = "Managua → Miami" }, Ct);
        await AssertProblema(alReves, HttpStatusCode.BadRequest, "de una ubicación en EE. UU. (US) a una en Nicaragua (NI)");
        using var inexistente = await admin.PostAsJsonAsync("/api/routes", new { origenId = 999, destinoId = mga.Id, nombre = "X" }, Ct);
        await AssertProblema(inexistente, HttpStatusCode.BadRequest, "La ubicación de origen 999 no existe");
        using var pais = await admin.PostAsJsonAsync("/api/locations", new { codigo = "SJO", nombre = "San José", pais = "CR" }, Ct);
        Assert.Equal(HttpStatusCode.BadRequest, pais.StatusCode);
    }

    [Fact]
    public async Task UbicacionEnRutaActivaNoSeDesactivaYRutaConUbicacionInactivaNoSeActiva()
    {
        using var admin = await ComoAsync(CodigosRol.Admin);
        var mia = await UbicacionAsync(admin, "MIA");
        var ruta = (await admin.GetFromJsonAsync<List<RouteResponse>>("/api/routes", JsonApi.Opciones, Ct))!.Single();

        using (var enUso = await admin.PostAsync($"/api/locations/{mia.Id}/deactivate", null, Ct))
        {
            await AssertProblema(enUso, HttpStatusCode.Conflict, "La ubicación MIA está en rutas activas");
        }

        await Post(admin, $"/api/routes/{ruta.Id}/deactivate", HttpStatusCode.NoContent);
        await Post(admin, $"/api/locations/{mia.Id}/deactivate", HttpStatusCode.NoContent);
        using (var activar = await admin.PostAsync($"/api/routes/{ruta.Id}/activate", null, Ct))
        {
            await AssertProblema(activar, HttpStatusCode.Conflict, "ubicación desactivada (MIA)");
        }

        // Una ruta desactivada no admite embarques nuevos.
        using (var embarque = await admin.PostAsJsonAsync("/api/shipments", new { metodoEnvio = "AEREO", rutaId = ruta.Id }, Ct))
        {
            Assert.Equal(HttpStatusCode.Conflict, embarque.StatusCode);
        }

        await Post(admin, $"/api/locations/{mia.Id}/activate", HttpStatusCode.NoContent);
        await Post(admin, $"/api/routes/{ruta.Id}/activate", HttpStatusCode.NoContent);
        Assert.True((await admin.GetFromJsonAsync<RouteResponse>($"/api/routes/{ruta.Id}", JsonApi.Opciones, Ct))!.Activo);
    }

    [Fact]
    public async Task RenombrarNoCambiaCodigoNiPais()
    {
        using var admin = await ComoAsync(CodigosRol.Admin);
        var mia = await UbicacionAsync(admin, "MIA");

        using var response = await admin.PutAsJsonAsync($"/api/locations/{mia.Id}", new { nombre = "Bodega Doral" }, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var renombrada = await Leer<LocationResponse>(response);
        Assert.Equal(("MIA", "Bodega Doral", "US"), (renombrada.Codigo, renombrada.Nombre, renombrada.Pais));
    }

    [Fact]
    public async Task SoloAdminYSoloDeSuAgencia()
    {
        using var adminA = await ComoAsync(CodigosRol.Admin);
        using var agente = await ComoAsync(CodigosRol.Agente);
        var mia = await UbicacionAsync(adminA, "MIA");
        var agenciaB = await CrearAgenciaAsync("Envíos B");
        using var adminB = await ComoEnAgenciaAsync(agenciaB, CodigosRol.Admin);

        using (var sinPermiso = await agente.GetAsync("/api/locations", Ct))
        {
            Assert.Equal(HttpStatusCode.Forbidden, sinPermiso.StatusCode);
        }
        Assert.Empty((await adminB.GetFromJsonAsync<List<LocationResponse>>("/api/locations", JsonApi.Opciones, Ct))!);
        // B puede usar el código MIA: los códigos son por agencia.
        var miaDeB = await CrearUbicacionAsync(adminB, "MIA", "Bodega B", "US");
        Assert.NotEqual(mia.Id, miaDeB.Id);
        using var ajena = await adminB.PostAsync($"/api/locations/{mia.Id}/deactivate", null, Ct);
        Assert.Equal(HttpStatusCode.NotFound, ajena.StatusCode);
    }

    private static async Task<LocationResponse> UbicacionAsync(HttpClient admin, string codigo) =>
        (await admin.GetFromJsonAsync<List<LocationResponse>>("/api/locations", JsonApi.Opciones, Ct))!.Single(u => u.Codigo == codigo);

    private static async Task<LocationResponse> CrearUbicacionAsync(HttpClient admin, string codigo, string nombre, string pais)
    {
        using var response = await admin.PostAsJsonAsync("/api/locations", new { codigo, nombre, pais }, Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await Leer<LocationResponse>(response);
    }

    private static async Task Post(HttpClient client, string url, HttpStatusCode esperado)
    {
        using var response = await client.PostAsync(url, null, Ct);
        Assert.Equal(esperado, response.StatusCode);
    }

    private static async Task AssertProblema(HttpResponseMessage response, HttpStatusCode estado, string detalleContiene)
    {
        Assert.Equal(estado, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problema = await Leer<JsonElement>(response);
        Assert.Contains(detalleContiene, problema.GetProperty("detail").GetString());
    }

    private static async Task<T> Leer<T>(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<T>(JsonApi.Opciones, Ct))!;
}
