using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Paqueteria.Api.Auth;
using Paqueteria.Api.DTOs;
using Paqueteria.Api.Entities;
using Paqueteria.IntegrationTests.Infrastructure;

namespace Paqueteria.IntegrationTests;

/// <summary>Módulo de embarques por HTTP contra PostgreSQL real, con el ciclo completo del paquete.</summary>
public class EmbarquesTests(ServidorPostgres servidor) : PruebaHttpConBaseDeDatos(servidor)
{
    [Fact]
    public async Task CicloCompletoDelRegistroAlPesaje()
    {
        using var agente = await ComoAsync(CodigosRol.Agente);
        using var bodega = await ComoAsync(CodigosRol.Bodega);
        var p1 = await PaqueteEnMiamiAsync(agente, bodega);
        var p2 = await PaqueteEnMiamiAsync(agente, bodega);

        var embarque = await CrearEmbarqueAsync(bodega, fechaEstimada: new DateOnly(2026, 10, 15));
        Assert.Matches(@"^AIR-\d{4}-0001$", embarque.CodigoEmbarque);
        Assert.Equal(EstadoEmbarque.Abierto, embarque.Estado);
        Assert.Equal("MIA", embarque.Ruta.Origen);

        embarque = (await PostAsync<ShipmentResponse>(bodega, $"/api/shipments/{embarque.Id}/packages",
            new { paqueteIds = new[] { p1.Id, p2.Id } }, HttpStatusCode.OK))!;
        Assert.Equal(2, embarque.CantidadPaquetes);
        var asignados = await GetAsync<List<PackageResponse>>(bodega, $"/api/shipments/{embarque.Id}/packages");
        Assert.All(asignados, p =>
        {
            Assert.Equal("PENDIENTE_DE_ENVIO", p.Estado.Codigo);
            Assert.Equal(embarque.CodigoEmbarque, p.CodigoEmbarque);
        });

        embarque = (await PostAsync<ShipmentResponse>(bodega, $"/api/shipments/{embarque.Id}/close", null, HttpStatusCode.OK))!;
        Assert.Equal(EstadoEmbarque.Cerrado, embarque.Estado);

        // Registrados después del hecho: salida hace 2 días, llegada hace 3 horas.
        var salida = SinFracciones(DateTimeOffset.UtcNow.AddDays(-2));
        var llegada = SinFracciones(DateTimeOffset.UtcNow.AddHours(-3)).ToOffset(TimeSpan.FromHours(-6)); // hora de Managua
        embarque = (await PostAsync<ShipmentResponse>(bodega, $"/api/shipments/{embarque.Id}/depart",
            new { fecha = salida }, HttpStatusCode.OK))!;
        Assert.Equal(EstadoEmbarque.EnTransito, embarque.Estado);
        Assert.Equal(salida, embarque.FechaSalida);

        embarque = (await PostAsync<ShipmentResponse>(bodega, $"/api/shipments/{embarque.Id}/arrive",
            new { fecha = llegada }, HttpStatusCode.OK))!;
        Assert.Equal(EstadoEmbarque.Recibido, embarque.Estado);
        Assert.Equal(llegada, embarque.FechaLlegadaReal);

        var enNicaragua = await GetAsync<PackageResponse>(bodega, $"/api/packages/{p1.Id}");
        Assert.Equal("RECIBIDO_EN_NICARAGUA", enNicaragua.Estado.Codigo);
        Assert.Equal(llegada, enNicaragua.FechaRecepcionNicaragua);

        // Ahora sí, sin atajos: pesaje y cálculo.
        var pesado = (await PostAsync<PackageResponse>(bodega, $"/api/packages/{p1.Id}/weigh",
            new { pesoLb = 4.5m }, HttpStatusCode.OK))!;
        Assert.Equal(15.75m, pesado.MontoCalculado);

        var historial = await GetAsync<List<PackageHistoryEntry>>(bodega, $"/api/packages/{p1.Id}/history");
        Assert.Equal(
            ["REGISTRADO", "RECIBIDO_EN_MIAMI", "PENDIENTE_DE_ENVIO", "EN_TRANSITO", "RECIBIDO_EN_NICARAGUA", "PENDIENTE_DE_PAGO"],
            historial.Select(h => h.Estado.Codigo));
        Assert.Equal(salida, historial[3].Fecha);
        Assert.Equal($"Salió en el embarque {embarque.CodigoEmbarque}", historial[3].Observacion);
    }

    [Fact]
    public async Task AsignarEsTodoONada()
    {
        using var agente = await ComoAsync(CodigosRol.Agente);
        using var bodega = await ComoAsync(CodigosRol.Bodega);
        var enMiami = await PaqueteEnMiamiAsync(agente, bodega);
        var soloRegistrado = await RegistrarPaqueteAsync(agente);
        var embarque = await CrearEmbarqueAsync(bodega);

        using var response = await bodega.PostAsJsonAsync($"/api/shipments/{embarque.Id}/packages",
            new { paqueteIds = new[] { enMiami.Id, soloRegistrado.Id } }, Ct);

        await AssertProblema(response, HttpStatusCode.Conflict,
            $"El paquete {soloRegistrado.CodigoPaquete} está REGISTRADO y no puede pasar a PENDIENTE_DE_ENVIO.");
        var sinCambios = await GetAsync<PackageResponse>(bodega, $"/api/packages/{enMiami.Id}");
        Assert.Equal("RECIBIDO_EN_MIAMI", sinCambios.Estado.Codigo);
        Assert.Null(sinCambios.CodigoEmbarque);
        Assert.Equal(0, (await GetAsync<ShipmentResponse>(bodega, $"/api/shipments/{embarque.Id}")).CantidadPaquetes);
    }

    [Fact]
    public async Task AsignarUnPaqueteDeOtroMetodoResponde409()
    {
        using var agente = await ComoAsync(CodigosRol.Agente);
        using var bodega = await ComoAsync(CodigosRol.Bodega);
        var maritimo = await PaqueteEnMiamiAsync(agente, bodega, "MARITIMO");
        var embarque = await CrearEmbarqueAsync(bodega);

        using var response = await bodega.PostAsJsonAsync($"/api/shipments/{embarque.Id}/packages",
            new { paqueteIds = new[] { maritimo.Id } }, Ct);

        await AssertProblema(response, HttpStatusCode.Conflict,
            $"El paquete {maritimo.CodigoPaquete} es MARITIMO y el embarque {embarque.CodigoEmbarque} es AEREO.");
    }

    [Fact]
    public async Task AsignarUnPaqueteInexistenteResponde400()
    {
        using var bodega = await ComoAsync(CodigosRol.Bodega);
        var embarque = await CrearEmbarqueAsync(bodega);

        using var response = await bodega.PostAsJsonAsync($"/api/shipments/{embarque.Id}/packages",
            new { paqueteIds = new[] { 999999L, 888888L } }, Ct);

        await AssertProblema(response, HttpStatusCode.BadRequest, "No existen los paquetes con id 888888, 999999.");
    }

    [Fact]
    public async Task NoSeAsignaNiSeQuitaEnUnEmbarqueCerrado()
    {
        using var agente = await ComoAsync(CodigosRol.Agente);
        using var bodega = await ComoAsync(CodigosRol.Bodega);
        var p1 = await PaqueteEnMiamiAsync(agente, bodega);
        var p2 = await PaqueteEnMiamiAsync(agente, bodega);
        var embarque = await CrearEmbarqueAsync(bodega);
        await PostAsync<ShipmentResponse>(bodega, $"/api/shipments/{embarque.Id}/packages", new { paqueteIds = new[] { p1.Id } }, HttpStatusCode.OK);
        await PostAsync<ShipmentResponse>(bodega, $"/api/shipments/{embarque.Id}/close", null, HttpStatusCode.OK);

        using var asignar = await bodega.PostAsJsonAsync($"/api/shipments/{embarque.Id}/packages", new { paqueteIds = new[] { p2.Id } }, Ct);
        using var quitar = await bodega.PostAsync($"/api/shipments/{embarque.Id}/packages/{p1.Id}/remove", null, Ct);

        await AssertProblema(asignar, HttpStatusCode.Conflict, "está CERRADO: no se puede asignarle paquetes");
        await AssertProblema(quitar, HttpStatusCode.Conflict, "está CERRADO: no se puede quitarle paquetes");
    }

    [Fact]
    public async Task QuitarUnPaqueteDeUnEmbarqueAbiertoLoDevuelveABodega()
    {
        using var agente = await ComoAsync(CodigosRol.Agente);
        using var bodega = await ComoAsync(CodigosRol.Bodega);
        var paquete = await PaqueteEnMiamiAsync(agente, bodega);
        var embarque = await CrearEmbarqueAsync(bodega);
        await PostAsync<ShipmentResponse>(bodega, $"/api/shipments/{embarque.Id}/packages", new { paqueteIds = new[] { paquete.Id } }, HttpStatusCode.OK);

        var sinPaquetes = (await PostAsync<ShipmentResponse>(bodega,
            $"/api/shipments/{embarque.Id}/packages/{paquete.Id}/remove", null, HttpStatusCode.OK))!;

        Assert.Equal(0, sinPaquetes.CantidadPaquetes);
        var devuelto = await GetAsync<PackageResponse>(bodega, $"/api/packages/{paquete.Id}");
        Assert.Equal("RECIBIDO_EN_MIAMI", devuelto.Estado.Codigo);
        Assert.Null(devuelto.CodigoEmbarque);
        Assert.Equal(paquete.FechaRecepcionMiami, devuelto.FechaRecepcionMiami); // no cambia
        var historial = await GetAsync<List<PackageHistoryEntry>>(bodega, $"/api/packages/{paquete.Id}/history");
        Assert.Equal($"Quitado del embarque {embarque.CodigoEmbarque}", historial[^1].Observacion);

        using var otraVez = await bodega.PostAsync($"/api/shipments/{embarque.Id}/packages/{paquete.Id}/remove", null, Ct);
        await AssertProblema(otraVez, HttpStatusCode.Conflict, $"no está en el embarque {embarque.CodigoEmbarque}");
    }

    [Fact]
    public async Task RecibirEnMiamiNoSacaUnPaqueteDeSuEmbarque()
    {
        using var agente = await ComoAsync(CodigosRol.Agente);
        using var bodega = await ComoAsync(CodigosRol.Bodega);
        var paquete = await PaqueteEnMiamiAsync(agente, bodega);
        var embarque = await CrearEmbarqueAsync(bodega);
        await PostAsync<ShipmentResponse>(bodega, $"/api/shipments/{embarque.Id}/packages", new { paqueteIds = new[] { paquete.Id } }, HttpStatusCode.OK);

        using var response = await bodega.PostAsync($"/api/packages/{paquete.Id}/receive-miami", null, Ct);

        await AssertProblema(response, HttpStatusCode.Conflict, "solo se recibe en Miami un paquete REGISTRADO");
    }

    [Fact]
    public async Task CerrarUnEmbarqueVacioResponde409()
    {
        using var bodega = await ComoAsync(CodigosRol.Bodega);
        var embarque = await CrearEmbarqueAsync(bodega);

        using var response = await bodega.PostAsync($"/api/shipments/{embarque.Id}/close", null, Ct);

        await AssertProblema(response, HttpStatusCode.Conflict, "no tiene paquetes: no se puede cerrar");
    }

    [Fact]
    public async Task SalidaYLlegadaRespetanElCicloYLasFechas()
    {
        using var agente = await ComoAsync(CodigosRol.Agente);
        using var bodega = await ComoAsync(CodigosRol.Bodega);
        var paquete = await PaqueteEnMiamiAsync(agente, bodega);
        var embarque = await CrearEmbarqueAsync(bodega);
        await PostAsync<ShipmentResponse>(bodega, $"/api/shipments/{embarque.Id}/packages", new { paqueteIds = new[] { paquete.Id } }, HttpStatusCode.OK);

        using (var salidaSinCerrar = await bodega.PostAsync($"/api/shipments/{embarque.Id}/depart", null, Ct))
        {
            await AssertProblema(salidaSinCerrar, HttpStatusCode.Conflict, "está ABIERTO: no se puede registrar su salida");
        }
        await PostAsync<ShipmentResponse>(bodega, $"/api/shipments/{embarque.Id}/close", null, HttpStatusCode.OK);
        using (var llegadaSinSalida = await bodega.PostAsync($"/api/shipments/{embarque.Id}/arrive", null, Ct))
        {
            await AssertProblema(llegadaSinSalida, HttpStatusCode.Conflict, "está CERRADO: no se puede registrar su llegada");
        }
        using (var salidaFutura = await bodega.PostAsJsonAsync($"/api/shipments/{embarque.Id}/depart",
            new { fecha = DateTimeOffset.UtcNow.AddDays(1) }, Ct))
        {
            await AssertProblema(salidaFutura, HttpStatusCode.BadRequest, "La fecha de salida no puede ser futura.");
        }

        var salida = DateTimeOffset.UtcNow.AddHours(-2);
        await PostAsync<ShipmentResponse>(bodega, $"/api/shipments/{embarque.Id}/depart", new { fecha = salida }, HttpStatusCode.OK);
        using var llegadaAntes = await bodega.PostAsJsonAsync($"/api/shipments/{embarque.Id}/arrive",
            new { fecha = salida.AddHours(-1) }, Ct);
        await AssertProblema(llegadaAntes, HttpStatusCode.BadRequest, "no puede ser anterior a la salida");
    }

    [Fact]
    public async Task CancelarSoloSinPaquetes()
    {
        using var agente = await ComoAsync(CodigosRol.Agente);
        using var bodega = await ComoAsync(CodigosRol.Bodega);
        var paquete = await PaqueteEnMiamiAsync(agente, bodega);
        var embarque = await CrearEmbarqueAsync(bodega);
        await PostAsync<ShipmentResponse>(bodega, $"/api/shipments/{embarque.Id}/packages", new { paqueteIds = new[] { paquete.Id } }, HttpStatusCode.OK);

        using (var conPaquetes = await bodega.PostAsync($"/api/shipments/{embarque.Id}/cancel", null, Ct))
        {
            await AssertProblema(conPaquetes, HttpStatusCode.Conflict, "tiene 1 paquete(s): quítelos antes de cancelarlo");
        }

        // Cancelar el paquete lo quita del embarque (módulo de paquetes); entonces el embarque se puede cancelar.
        await PostAsync<PackageResponse>(agente, $"/api/packages/{paquete.Id}/cancel", new { motivo = "Devuelto" }, HttpStatusCode.OK);
        var cancelado = await PostAsync<ShipmentResponse>(bodega, $"/api/shipments/{embarque.Id}/cancel", null, HttpStatusCode.OK);
        Assert.Equal(EstadoEmbarque.Cancelado, cancelado!.Estado);
    }

    [Fact]
    public async Task DosSalidasSimultaneasSoloMuevenLosPaquetesUnaVez()
    {
        using var agente = await ComoAsync(CodigosRol.Agente);
        using var bodega1 = await ComoAsync(CodigosRol.Bodega);
        using var bodega2 = await ComoAsync(CodigosRol.Bodega);
        var p1 = await PaqueteEnMiamiAsync(agente, bodega1);
        var p2 = await PaqueteEnMiamiAsync(agente, bodega1);
        var embarque = await CrearEmbarqueAsync(bodega1);
        await PostAsync<ShipmentResponse>(bodega1, $"/api/shipments/{embarque.Id}/packages", new { paqueteIds = new[] { p1.Id, p2.Id } }, HttpStatusCode.OK);
        await PostAsync<ShipmentResponse>(bodega1, $"/api/shipments/{embarque.Id}/close", null, HttpStatusCode.OK);

        var respuestas = await Task.WhenAll(
            bodega1.PostAsync($"/api/shipments/{embarque.Id}/depart", null, Ct),
            bodega2.PostAsync($"/api/shipments/{embarque.Id}/depart", null, Ct));

        Assert.Equal([HttpStatusCode.OK, HttpStatusCode.Conflict], respuestas.Select(r => r.StatusCode).Order());
        await using var db = NuevoContexto();
        Assert.Equal(2, await db.HistorialEstadosPaquete.CountAsync(h => h.EstadoId == EstadoPaquete.EnTransito, Ct));
        foreach (var respuesta in respuestas)
        {
            respuesta.Dispose();
        }
    }

    [Fact]
    public async Task BuscaYFiltraEmbarques()
    {
        using var bodega = await ComoAsync(CodigosRol.Bodega);
        var aereo = await CrearEmbarqueAsync(bodega);
        var maritimo = await CrearEmbarqueAsync(bodega, "MARITIMO");
        await PostAsync<ShipmentResponse>(bodega, $"/api/shipments/{maritimo.Id}/cancel", null, HttpStatusCode.OK);

        Assert.Equal([aereo.Id], await Ids(bodega, "?estado=abierto"));
        Assert.Equal([maritimo.Id], await Ids(bodega, "?estado=CANCELADO"));
        Assert.Equal([maritimo.Id], await Ids(bodega, "?metodoEnvio=MARITIMO"));
        Assert.Equal([aereo.Id], await Ids(bodega, "?search=AIR-"));
        Assert.Equal([maritimo.Id, aereo.Id], await Ids(bodega, "")); // más recientes primero

        using var estadoInvalido = await bodega.GetAsync("/api/shipments?estado=PERDIDO", Ct);
        await AssertProblema(estadoInvalido, HttpStatusCode.BadRequest, "El estado de embarque 'PERDIDO' no existe.");
    }

    [Fact]
    public async Task ElEstadoViajaComoCodigoEnElJson()
    {
        using var bodega = await ComoAsync(CodigosRol.Bodega);
        var embarque = await CrearEmbarqueAsync(bodega);

        var json = await bodega.GetFromJsonAsync<JsonElement>($"/api/shipments/{embarque.Id}", Ct);

        Assert.Equal("ABIERTO", json.GetProperty("estado").GetString());
    }

    [Fact]
    public async Task CatalogoTieneMetodosRutasYEstados()
    {
        using var repartidor = await ComoAsync(CodigosRol.Repartidor); // cualquier empleado activo

        var catalogo = await GetAsync<CatalogsResponse>(repartidor, "/api/catalogs");

        Assert.Equal(["AEREO", "MARITIMO"], catalogo.MetodosEnvio.Select(m => m.Codigo));
        var ruta = Assert.Single(catalogo.Rutas);
        Assert.Equal(("MIA", "MGA"), (ruta.Origen, ruta.Destino));
        Assert.Equal(11, catalogo.EstadosPaquete.Count);
        Assert.Equal("REGISTRADO", catalogo.EstadosPaquete[0].Codigo);
    }

    [Fact]
    public async Task EmbarqueInexistenteResponde404()
    {
        using var admin = await ComoAsync(CodigosRol.Admin);

        var rutas = new[] { "", "/packages" };
        foreach (var ruta in rutas)
        {
            using var get = await admin.GetAsync($"/api/shipments/999999{ruta}", Ct);
            Assert.Equal(HttpStatusCode.NotFound, get.StatusCode);
        }
        foreach (var accion in new[] { "close", "depart", "arrive", "cancel", "packages/1/remove" })
        {
            using var post = await admin.PostAsync($"/api/shipments/999999/{accion}", null, Ct);
            Assert.Equal(HttpStatusCode.NotFound, post.StatusCode);
        }
    }

    [Theory]
    [InlineData(CodigosRol.Agente, "listar", HttpStatusCode.OK)]
    [InlineData(CodigosRol.Agente, "ver", HttpStatusCode.OK)]
    [InlineData(CodigosRol.Agente, "crear", HttpStatusCode.Forbidden)]
    [InlineData(CodigosRol.Agente, "cerrar", HttpStatusCode.Forbidden)]
    [InlineData(CodigosRol.Agente, "cancelar", HttpStatusCode.Forbidden)]
    [InlineData(CodigosRol.Bodega, "crear", HttpStatusCode.Created)]
    [InlineData(CodigosRol.Bodega, "editar", HttpStatusCode.OK)]
    [InlineData(CodigosRol.Bodega, "cancelar", HttpStatusCode.OK)]
    [InlineData(CodigosRol.Admin, "crear", HttpStatusCode.Created)]
    [InlineData(CodigosRol.Repartidor, "listar", HttpStatusCode.Forbidden)]
    public async Task PermisosPorRol(string rol, string operacion, HttpStatusCode esperado)
    {
        using var bodega = await ComoAsync(CodigosRol.Bodega);
        var embarque = await CrearEmbarqueAsync(bodega);
        using var client = await ComoAsync(rol);

        using var response = operacion switch
        {
            "listar" => await client.GetAsync("/api/shipments", Ct),
            "ver" => await client.GetAsync($"/api/shipments/{embarque.Id}", Ct),
            "crear" => await client.PostAsJsonAsync("/api/shipments", new { metodoEnvio = "AEREO", rutaId = embarque.Ruta.Id }, Ct),
            "editar" => await client.PutAsJsonAsync($"/api/shipments/{embarque.Id}", new { observaciones = "Contenedor 2" }, Ct),
            "cerrar" => await client.PostAsync($"/api/shipments/{embarque.Id}/close", null, Ct),
            "cancelar" => await client.PostAsync($"/api/shipments/{embarque.Id}/cancel", null, Ct),
            _ => throw new ArgumentOutOfRangeException(nameof(operacion)),
        };

        Assert.Equal(esperado, response.StatusCode);
    }

    // ---- Preparación ----

    private async Task<PackageResponse> RegistrarPaqueteAsync(HttpClient agente, string metodo = "AEREO")
    {
        long clienteId;
        await using (var db = NuevoContexto())
        {
            clienteId = (await CrearClienteAsync(db)).Id;
        }
        return (await PostAsync<PackageResponse>(agente, "/api/packages",
            new { clienteId, metodoEnvio = metodo, descripcion = "Audífonos" }, HttpStatusCode.Created))!;
    }

    private async Task<PackageResponse> PaqueteEnMiamiAsync(HttpClient agente, HttpClient bodega, string metodo = "AEREO")
    {
        var paquete = await RegistrarPaqueteAsync(agente, metodo);
        return (await PostAsync<PackageResponse>(bodega, $"/api/packages/{paquete.Id}/receive-miami", null, HttpStatusCode.OK))!;
    }

    private async Task<ShipmentResponse> CrearEmbarqueAsync(HttpClient bodega, string metodo = "AEREO", DateOnly? fechaEstimada = null)
    {
        int rutaId;
        await using (var db = NuevoContexto())
        {
            rutaId = await db.Rutas.Select(r => r.Id).SingleAsync(Ct);
        }
        return (await PostAsync<ShipmentResponse>(bodega, "/api/shipments",
            new { metodoEnvio = metodo, rutaId, fechaLlegadaEstimada = fechaEstimada }, HttpStatusCode.Created))!;
    }

    // ---- HTTP ----

    private static async Task<T?> PostAsync<T>(HttpClient client, string ruta, object? cuerpo, HttpStatusCode esperado)
    {
        using var response = cuerpo is null
            ? await client.PostAsync(ruta, null, Ct)
            : await client.PostAsJsonAsync(ruta, cuerpo, JsonApi.Opciones, Ct);
        if (response.StatusCode != esperado)
        {
            Assert.Fail($"{ruta}: se esperaba {esperado} y se obtuvo {response.StatusCode}: {await response.Content.ReadAsStringAsync(Ct)}");
        }
        return await response.Content.ReadFromJsonAsync<T>(JsonApi.Opciones, Ct);
    }

    private static async Task<T> GetAsync<T>(HttpClient client, string ruta) =>
        (await client.GetFromJsonAsync<T>(ruta, JsonApi.Opciones, Ct))!;

    private static async Task<long[]> Ids(HttpClient client, string consulta) =>
        (await GetAsync<PagedResponse<ShipmentResponse>>(client, $"/api/shipments{consulta}")).Items.Select(e => e.Id).ToArray();

    private static async Task AssertProblema(HttpResponseMessage response, HttpStatusCode estado, string detalleContiene)
    {
        Assert.Equal(estado, response.StatusCode);
        var problema = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        Assert.Contains(detalleContiene, problema.GetProperty("detail").GetString());
    }

    /// <summary>PostgreSQL guarda microsegundos; se descartan las fracciones para comparar exacto.</summary>
    private static DateTimeOffset SinFracciones(DateTimeOffset fecha) =>
        new(fecha.Year, fecha.Month, fecha.Day, fecha.Hour, fecha.Minute, fecha.Second, fecha.Offset);
}
