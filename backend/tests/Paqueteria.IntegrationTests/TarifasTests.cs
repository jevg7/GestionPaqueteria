using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Paqueteria.Api.Auth;
using Paqueteria.Api.DTOs;
using Paqueteria.Api.Services;
using Paqueteria.IntegrationTests.Infrastructure;

namespace Paqueteria.IntegrationTests;

/// <summary>
/// Tarifas por HTTP: rigen desde hoy en adelante, cierran y reabren la anterior, y no se anulan si ya
/// se aplicaron. seed.sql deja una tarifa AEREO de 3.50 desde 2026-01-01, sin fin.
/// </summary>
public class TarifasTests(ServidorPostgres servidor) : PruebaHttpConBaseDeDatos(servidor)
{
    private static DateOnly Hoy => CalculoMonto.FechaEnManagua(DateTimeOffset.UtcNow);

    [Fact]
    public async Task NuevaTarifaDesdeHoyCierraLaAnteriorElDiaPrevio()
    {
        using var admin = await ComoAsync(CodigosRol.Admin);
        var semilla = await TarifaDeSemillaAsync();

        using var response = await admin.PostAsJsonAsync("/api/rates", new { metodoEnvio = "aereo", precioPorUnidad = 4.25m }, Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var nueva = await Leer<RateResponse>(response);
        Assert.Equal((4.25m, Hoy, (DateOnly?)null, EstadoTarifa.Vigente), (nueva.PrecioPorUnidad, nueva.FechaInicio, nueva.FechaFin, nueva.Estado));
        Assert.Equal("AEREO", nueva.MetodoEnvio.Codigo);

        var historial = await Listar(admin, "?metodoEnvio=AEREO");
        Assert.Equal([nueva.Id, semilla], historial.Select(t => t.Id));
        Assert.Equal((Hoy.AddDays(-1), EstadoTarifa.Vencida), (historial[1].FechaFin, historial[1].Estado));

        var vigentes = await admin.GetFromJsonAsync<List<CurrentRateResponse>>("/api/rates/current", JsonApi.Opciones, Ct);
        Assert.Equal(["AEREO", "MARITIMO"], vigentes!.Select(v => v.MetodoEnvio.Codigo));
        Assert.Equal(nueva.Id, vigentes![0].Tarifa?.Id);
        Assert.Null(vigentes[1].Tarifa);
    }

    [Fact]
    public async Task TarifaProgramadaSeAnulaYLaAnteriorVuelveARegir()
    {
        using var admin = await ComoAsync(CodigosRol.Admin);
        var semilla = await TarifaDeSemillaAsync();

        var programada = await CrearAsync(admin, "AEREO", 5m, Hoy.AddDays(10));
        Assert.Equal(EstadoTarifa.Programada, programada.Estado);
        Assert.Equal(Hoy.AddDays(9), (await Obtener(admin, semilla)).FechaFin);

        // Otra que empezaría antes de la programada: primero hay que anular esa.
        using (var antes = await admin.PostAsJsonAsync("/api/rates", Datos("AEREO", 6m, Hoy.AddDays(5)), Ct))
        {
            await AssertProblema(antes, HttpStatusCode.Conflict, $"Ya hay una tarifa AEREO desde el {Hoy.AddDays(10):yyyy-MM-dd}");
        }

        using (var anular = await admin.PostAsync($"/api/rates/{programada.Id}/void", null, Ct))
        {
            Assert.Equal(HttpStatusCode.NoContent, anular.StatusCode);
        }
        var reabierta = await Obtener(admin, semilla);
        Assert.Equal(((DateOnly?)null, EstadoTarifa.Vigente), (reabierta.FechaFin, reabierta.Estado));
        Assert.Equal(EstadoTarifa.Anulada, (await Obtener(admin, programada.Id)).Estado);
        Assert.DoesNotContain(await Listar(admin, ""), t => t.Id == programada.Id);
        Assert.Contains(await Listar(admin, "?incluirAnuladas=true"), t => t.Id == programada.Id);

        using var otraVez = await admin.PostAsync($"/api/rates/{programada.Id}/void", null, Ct);
        await AssertProblema(otraVez, HttpStatusCode.Conflict, "ya está anulada");
    }

    [Fact]
    public async Task TarifaVigenteSinPaquetesSeAnulaPeroUsadaNo()
    {
        using var admin = await ComoAsync(CodigosRol.Admin);
        var semilla = await TarifaDeSemillaAsync();
        var equivocada = await CrearAsync(admin, "AEREO", 40m, Hoy);

        using (var anular = await admin.PostAsync($"/api/rates/{equivocada.Id}/void", null, Ct))
        {
            Assert.Equal(HttpStatusCode.NoContent, anular.StatusCode);
        }
        Assert.Null((await Obtener(admin, semilla)).FechaFin);

        var usada = await CrearAsync(admin, "AEREO", 4m, Hoy);
        await PesarConTarifaAsync(usada.Id);
        using var response = await admin.PostAsync($"/api/rates/{usada.Id}/void", null, Ct);
        await AssertProblema(response, HttpStatusCode.Conflict, "ya se aplicó a paquetes");
    }

    [Fact]
    public async Task TarifaVencidaNoSeAnula()
    {
        using var admin = await ComoAsync(CodigosRol.Admin);
        var semilla = await TarifaDeSemillaAsync();
        await CrearAsync(admin, "AEREO", 4m, Hoy);

        using var response = await admin.PostAsync($"/api/rates/{semilla}/void", null, Ct);

        await AssertProblema(response, HttpStatusCode.Conflict, "ya venció");
    }

    [Theory]
    [InlineData("AEREO", "3.5", -1, "no puede ser anterior")]
    [InlineData("TERRESTRE", "3.5", 0, "no existe")]
    [InlineData("AEREO", "3.12345", 0, "hasta 4 decimales")]
    [InlineData("AEREO", "0", 0, "mayor que cero")]
    public async Task DatosInvalidosResponden400(string metodo, string precio, int dias, string mensaje)
    {
        using var admin = await ComoAsync(CodigosRol.Admin);

        using var response = await admin.PostAsJsonAsync("/api/rates", Datos(metodo, decimal.Parse(precio, System.Globalization.CultureInfo.InvariantCulture), Hoy.AddDays(dias)), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains(mensaje, await response.Content.ReadAsStringAsync(Ct));
    }

    [Fact]
    public async Task ConsultanAdminAgenteYBodegaPeroSoloAdminRegistra()
    {
        using var bodega = await ComoAsync(CodigosRol.Bodega);
        using var repartidor = await ComoAsync(CodigosRol.Repartidor);

        using (var leer = await bodega.GetAsync("/api/rates/current", Ct))
        {
            Assert.Equal(HttpStatusCode.OK, leer.StatusCode);
        }
        using (var registrar = await bodega.PostAsJsonAsync("/api/rates", Datos("AEREO", 4m, Hoy), Ct))
        {
            Assert.Equal(HttpStatusCode.Forbidden, registrar.StatusCode);
        }
        using var sinPermiso = await repartidor.GetAsync("/api/rates", Ct);
        Assert.Equal(HttpStatusCode.Forbidden, sinPermiso.StatusCode);
    }

    [Fact]
    public async Task CadaAgenciaTieneSusPropiasTarifas()
    {
        using var adminA = await ComoAsync(CodigosRol.Admin);
        var agenciaB = await CrearAgenciaAsync("Envíos B");
        using var adminB = await ComoEnAgenciaAsync(agenciaB, CodigosRol.Admin);
        var semilla = await TarifaDeSemillaAsync();

        Assert.Empty(await Listar(adminB, ""));
        var deB = await CrearAsync(adminB, "AEREO", 2.75m, Hoy);

        var vigenteA = (await adminA.GetFromJsonAsync<List<CurrentRateResponse>>("/api/rates/current", JsonApi.Opciones, Ct))![0];
        Assert.Equal((semilla, 3.50m), (vigenteA.Tarifa!.Id, vigenteA.Tarifa.PrecioPorUnidad));
        using var ajena = await adminA.PostAsync($"/api/rates/{deB.Id}/void", null, Ct);
        Assert.Equal(HttpStatusCode.NotFound, ajena.StatusCode);
    }

    private async Task<int> TarifaDeSemillaAsync()
    {
        await using var db = NuevoContexto();
        return await db.TarifasEnvio.Where(t => t.FechaInicio == new DateOnly(2026, 1, 1)).Select(t => t.Id).SingleAsync(Ct);
    }

    /// <summary>Deja un paquete pesado con esa tarifa (el cálculo completo, como lo guarda el pesaje).</summary>
    private async Task PesarConTarifaAsync(int tarifaId)
    {
        await using var db = NuevoContexto();
        var cliente = await CrearClienteAsync(db);
        var usuario = await CrearUsuarioAsync(db);
        var paquete = await CrearPaqueteAereoAsync(db, cliente, usuario);
        var precio = await db.TarifasEnvio.Where(t => t.Id == tarifaId).Select(t => t.PrecioPorUnidad).SingleAsync(Ct);
        paquete.PesoLb = 2m;
        paquete.TarifaId = tarifaId;
        paquete.TarifaAplicada = precio;
        paquete.MontoCalculado = CalculoMonto.Calcular(2m, precio);
        await db.SaveChangesAsync(Ct);
    }

    private static async Task<RateResponse> CrearAsync(HttpClient admin, string metodo, decimal precio, DateOnly inicio)
    {
        using var response = await admin.PostAsJsonAsync("/api/rates", Datos(metodo, precio, inicio), Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await Leer<RateResponse>(response);
    }

    private static async Task<RateResponse> Obtener(HttpClient client, int id) =>
        (await client.GetFromJsonAsync<RateResponse>($"/api/rates/{id}", JsonApi.Opciones, Ct))!;

    private static async Task<List<RateResponse>> Listar(HttpClient client, string consulta) =>
        (await client.GetFromJsonAsync<List<RateResponse>>($"/api/rates{consulta}", JsonApi.Opciones, Ct))!;

    private static object Datos(string metodo, decimal precio, DateOnly inicio) =>
        new { metodoEnvio = metodo, precioPorUnidad = precio, fechaInicio = inicio };

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
