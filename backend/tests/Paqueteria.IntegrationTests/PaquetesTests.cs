using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Paqueteria.Api.Auth;
using Paqueteria.Api.DTOs;
using Paqueteria.Api.Entities;
using Paqueteria.Api.Services;
using Paqueteria.IntegrationTests.Infrastructure;
using static Paqueteria.Api.Entities.EstadoPaquete;

namespace Paqueteria.IntegrationTests;

/// <summary>Módulo de paquetes por HTTP contra PostgreSQL real: registro, edición, transiciones y permisos.</summary>
public class PaquetesTests(ServidorPostgres servidor) : PruebaHttpConBaseDeDatos(servidor)
{
    [Fact]
    public async Task EnumEstadoPaqueteCoincideConElCatalogo()
    {
        await using var db = NuevoContexto();

        var catalogo = await db.EstadosPaquete.OrderBy(e => e.Id).ToListAsync(Ct);

        Assert.Equal(Enum.GetValues<EstadoPaquete>(), catalogo.Select(e => e.Id));
        Assert.All(catalogo, e =>
        {
            Assert.Equal(e.Codigo, TransicionesPaquete.Codigo(e.Id));
            Assert.Equal(e.EsFinal, TransicionesPaquete.EsFinal(e.Id));
        });
    }

    [Fact]
    public async Task RegistrarDevuelve201EnRegistradoConHistorialInicial()
    {
        var cliente = await ClienteAsync();
        using var agente = await ComoAsync(CodigosRol.Agente);

        using var response = await agente.PostAsJsonAsync("/api/packages",
            Datos(cliente.Id, tracking: " TBA123 ", tienda: "Amazon", descripcion: " Audífonos "), Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var paquete = await Leer<PackageResponse>(response);
        Assert.Equal("PKG-000001", paquete.CodigoPaquete);
        Assert.Equal("REGISTRADO", paquete.Estado.Codigo);
        Assert.Equal(cliente.CodigoCliente, paquete.Cliente.CodigoCliente);
        Assert.Equal("AEREO", paquete.MetodoEnvio.Codigo);
        Assert.Equal("TBA123", paquete.TrackingExterno);
        Assert.Equal("Audífonos", paquete.Descripcion);
        Assert.Null(paquete.PesoLb);
        Assert.Equal($"/api/packages/{paquete.Id}", response.Headers.Location?.AbsolutePath);

        var historial = await Historial(agente, paquete.Id);
        var inicial = Assert.Single(historial);
        Assert.Equal("REGISTRADO", inicial.Estado.Codigo);
        Assert.Equal("Bruno Bodega", inicial.Usuario);
    }

    [Fact]
    public async Task RegistrarParaClienteInexistenteResponde400()
    {
        using var agente = await ComoAsync(CodigosRol.Agente);

        using var response = await agente.PostAsJsonAsync("/api/packages", Datos(999999), Ct);

        await AssertProblema(response, HttpStatusCode.BadRequest, "El cliente 999999 no existe.");
    }

    [Fact]
    public async Task RegistrarParaClienteDesactivadoResponde409()
    {
        var cliente = await ClienteAsync(activo: false);
        using var agente = await ComoAsync(CodigosRol.Agente);

        using var response = await agente.PostAsJsonAsync("/api/packages", Datos(cliente.Id), Ct);

        await AssertProblema(response, HttpStatusCode.Conflict, $"El cliente {cliente.CodigoCliente} está desactivado");
    }

    [Fact]
    public async Task RegistrarConMetodoDesconocidoResponde400()
    {
        var cliente = await ClienteAsync();
        using var agente = await ComoAsync(CodigosRol.Agente);

        using var response = await agente.PostAsJsonAsync("/api/packages", Datos(cliente.Id, metodo: "TERRESTRE"), Ct);

        await AssertProblema(response, HttpStatusCode.BadRequest, "El método de envío 'TERRESTRE' no existe.");
    }

    [Fact]
    public async Task RegistrarSinDescripcionResponde400()
    {
        var cliente = await ClienteAsync();
        using var agente = await ComoAsync(CodigosRol.Agente);

        using var response = await agente.PostAsJsonAsync("/api/packages", Datos(cliente.Id, descripcion: "  "), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task TrackingRepetidoResponde409ConElPaqueteQueLoTiene()
    {
        var cliente = await ClienteAsync();
        using var agente = await ComoAsync(CodigosRol.Agente);
        await RegistrarAsync(agente, Datos(cliente.Id, tracking: "TBA123"));

        using var response = await agente.PostAsJsonAsync("/api/packages", Datos(cliente.Id, tracking: "tba123"), Ct);

        await AssertProblema(response, HttpStatusCode.Conflict, "El tracking tba123 ya está registrado en el paquete PKG-000001.");
    }

    [Fact]
    public async Task ElTrackingDeUnPaqueteCanceladoSePuedeVolverARegistrar()
    {
        var cliente = await ClienteAsync();
        using var agente = await ComoAsync(CodigosRol.Agente);
        var cancelado = await RegistrarAsync(agente, Datos(cliente.Id, tracking: "TBA123"));
        await EnviarAsync(agente, $"/api/packages/{cancelado.Id}/cancel", new { motivo = "Registrado por error" }, HttpStatusCode.OK);

        var nuevo = await RegistrarAsync(agente, Datos(cliente.Id, tracking: "TBA123"));

        Assert.Equal("PKG-000002", nuevo.CodigoPaquete);
    }

    [Fact]
    public async Task RecibirEnMiamiCambiaElEstadoYPoneLaFecha()
    {
        var paquete = await PaqueteAsync();
        using var bodega = await ComoAsync(CodigosRol.Bodega);

        var recibido = await EnviarAsync(bodega, $"/api/packages/{paquete.Id}/receive-miami",
            new { observacion = "Caja dañada" }, HttpStatusCode.OK);

        Assert.Equal("RECIBIDO_EN_MIAMI", recibido!.Estado.Codigo);
        Assert.NotNull(recibido.FechaRecepcionMiami);
        var ultimo = (await Historial(bodega, paquete.Id))[^1];
        Assert.Equal("RECIBIDO_EN_MIAMI", ultimo.Estado.Codigo);
        Assert.Equal("Caja dañada", ultimo.Observacion);

        using var otraVez = await bodega.PostAsync($"/api/packages/{paquete.Id}/receive-miami", null, Ct);
        await AssertProblema(otraVez, HttpStatusCode.Conflict,
            $"El paquete {paquete.CodigoPaquete} está RECIBIDO_EN_MIAMI y no puede pasar a RECIBIDO_EN_MIAMI.");
    }

    [Fact]
    public async Task DosRecepcionesSimultaneasSoloRegistranUna()
    {
        var paquete = await PaqueteAsync();
        using var bodega1 = await ComoAsync(CodigosRol.Bodega);
        using var bodega2 = await ComoAsync(CodigosRol.Bodega);

        var respuestas = await Task.WhenAll(
            bodega1.PostAsync($"/api/packages/{paquete.Id}/receive-miami", null, Ct),
            bodega2.PostAsync($"/api/packages/{paquete.Id}/receive-miami", null, Ct));

        Assert.Equal([HttpStatusCode.OK, HttpStatusCode.Conflict], respuestas.Select(r => r.StatusCode).Order());
        await using var db = NuevoContexto();
        Assert.Equal(1, await db.HistorialEstadosPaquete.CountAsync(h => h.PaqueteId == paquete.Id && h.EstadoId == RecibidoEnMiami, Ct));
        foreach (var respuesta in respuestas)
        {
            respuesta.Dispose();
        }
    }

    [Fact]
    public async Task PesarCalculaElMontoConLaTarifaVigenteYPasaAPendienteDePago()
    {
        var paquete = await PaqueteAsync();
        await AvanzarAsync(paquete.Id, RecibidoEnMiami, PendienteDeEnvio, EnTransito, RecibidoEnNicaragua);
        using var bodega = await ComoAsync(CodigosRol.Bodega);

        var pesado = await EnviarAsync(bodega, $"/api/packages/{paquete.Id}/weigh", new { pesoLb = 4.5m }, HttpStatusCode.OK);

        Assert.Equal("PENDIENTE_DE_PAGO", pesado!.Estado.Codigo);
        Assert.Equal(4.5m, pesado.PesoLb);
        Assert.Equal(3.50m, pesado.TarifaAplicada); // tarifa aérea de seed.sql
        Assert.Equal(15.75m, pesado.MontoCalculado);
        var historial = await Historial(bodega, paquete.Id);
        Assert.Equal("PENDIENTE_DE_PAGO", historial[^1].Estado.Codigo);

        // Corrección antes de facturar: recalcula sin cambiar de estado ni agregar historial.
        var corregido = await EnviarAsync(bodega, $"/api/packages/{paquete.Id}/weigh", new { pesoLb = 2.25m }, HttpStatusCode.OK);
        Assert.Equal("PENDIENTE_DE_PAGO", corregido!.Estado.Codigo);
        Assert.Equal(7.88m, corregido.MontoCalculado);
        Assert.Equal(historial.Count, (await Historial(bodega, paquete.Id)).Count);
    }

    [Fact]
    public async Task PesarAntesDeLlegarANicaraguaResponde409()
    {
        var paquete = await PaqueteAsync();
        using var bodega = await ComoAsync(CodigosRol.Bodega);

        using var response = await bodega.PostAsJsonAsync($"/api/packages/{paquete.Id}/weigh", new { pesoLb = 4.5m }, Ct);

        await AssertProblema(response, HttpStatusCode.Conflict, "está REGISTRADO y no puede pasar a PENDIENTE_DE_PAGO");
    }

    [Fact]
    public async Task PesarSinTarifaVigenteResponde409SinCambiarNada()
    {
        // seed.sql todavía no tiene tarifa marítima (pregunta abierta con la agencia).
        var paquete = await PaqueteAsync(metodo: "MARITIMO");
        await AvanzarAsync(paquete.Id, RecibidoEnMiami, PendienteDeEnvio, EnTransito, RecibidoEnNicaragua);
        using var bodega = await ComoAsync(CodigosRol.Bodega);

        using var response = await bodega.PostAsJsonAsync($"/api/packages/{paquete.Id}/weigh", new { pesoLb = 10m }, Ct);

        await AssertProblema(response, HttpStatusCode.Conflict, "No hay una tarifa vigente para el método MARITIMO");
        var actual = await bodega.GetFromJsonAsync<PackageResponse>($"/api/packages/{paquete.Id}", Ct);
        Assert.Equal("RECIBIDO_EN_NICARAGUA", actual!.Estado.Codigo);
        Assert.Null(actual.PesoLb);
    }

    [Theory]
    [InlineData("0")]
    [InlineData("-1")]
    [InlineData("4.567")]
    public async Task PesoInvalidoResponde400(string peso)
    {
        var paquete = await PaqueteAsync();
        await AvanzarAsync(paquete.Id, RecibidoEnMiami, PendienteDeEnvio, EnTransito, RecibidoEnNicaragua);
        using var bodega = await ComoAsync(CodigosRol.Bodega);

        using var response = await bodega.PostAsync($"/api/packages/{paquete.Id}/weigh",
            new StringContent($"{{\"pesoLb\":{peso}}}", System.Text.Encoding.UTF8, "application/json"), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task UnPaqueteFacturadoNoSeCorrigeNiSeEdita()
    {
        var paquete = await PaqueteAsync();
        await AvanzarAsync(paquete.Id, RecibidoEnMiami, PendienteDeEnvio, EnTransito, RecibidoEnNicaragua);
        using var bodega = await ComoAsync(CodigosRol.Bodega);
        var pesado = (await EnviarAsync(bodega, $"/api/packages/{paquete.Id}/weigh", new { pesoLb = 4.5m }, HttpStatusCode.OK))!;
        await FacturarAsync(pesado);
        using var agente = await ComoAsync(CodigosRol.Agente);

        using var corregir = await bodega.PostAsJsonAsync($"/api/packages/{paquete.Id}/weigh", new { pesoLb = 3m }, Ct);
        using var editar = await agente.PutAsJsonAsync($"/api/packages/{paquete.Id}",
            Datos(pesado.Cliente.Id, descripcion: "Otra"), Ct);

        await AssertProblema(corregir, HttpStatusCode.Conflict, "está en la factura FAC-000001");
        await AssertProblema(editar, HttpStatusCode.Conflict, "está en la factura FAC-000001");
    }

    [Fact]
    public async Task CancelarDesdePendienteDeEnvioLoQuitaDelEmbarque()
    {
        var paquete = await PaqueteAsync();
        await AvanzarAsync(paquete.Id, RecibidoEnMiami);
        await AsignarAEmbarqueAsync(paquete.Id);
        await AvanzarAsync(paquete.Id, PendienteDeEnvio);
        using var agente = await ComoAsync(CodigosRol.Agente);
        Assert.NotNull((await agente.GetFromJsonAsync<PackageResponse>($"/api/packages/{paquete.Id}", Ct))!.CodigoEmbarque);

        var cancelado = await EnviarAsync(agente, $"/api/packages/{paquete.Id}/cancel",
            new { motivo = "El cliente devolvió la compra" }, HttpStatusCode.OK);

        Assert.Equal("CANCELADO", cancelado!.Estado.Codigo);
        Assert.Null(cancelado.CodigoEmbarque);
        var historial = await Historial(agente, paquete.Id);
        Assert.Equal("CANCELADO", historial[^1].Estado.Codigo);
        Assert.Equal("El cliente devolvió la compra", historial[^1].Observacion);
        Assert.Contains(historial, h => h.Estado.Codigo == "PENDIENTE_DE_ENVIO");
    }

    [Fact]
    public async Task CancelarDespuesDeSalirElEmbarqueResponde409()
    {
        var paquete = await PaqueteAsync();
        await AvanzarAsync(paquete.Id, RecibidoEnMiami, PendienteDeEnvio, EnTransito);
        using var agente = await ComoAsync(CodigosRol.Agente);

        using var response = await agente.PostAsJsonAsync($"/api/packages/{paquete.Id}/cancel", new { motivo = "x" }, Ct);

        await AssertProblema(response, HttpStatusCode.Conflict, "está EN_TRANSITO y no puede pasar a CANCELADO");
    }

    [Fact]
    public async Task CancelarSinMotivoResponde400()
    {
        var paquete = await PaqueteAsync();
        using var agente = await ComoAsync(CodigosRol.Agente);

        using var response = await agente.PostAsJsonAsync($"/api/packages/{paquete.Id}/cancel", new { motivo = " " }, Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task EditarPorEtapas()
    {
        var paquete = await PaqueteAsync();
        var otroCliente = await ClienteAsync();
        using var agente = await ComoAsync(CodigosRol.Agente);

        // REGISTRADO: se puede cambiar todo.
        var editado = await EnviarPutAsync(agente, paquete.Id,
            Datos(otroCliente.Id, metodo: "maritimo", tracking: "SEA999", tienda: "Walmart", descripcion: "Licuadora"), HttpStatusCode.OK);
        Assert.Equal(otroCliente.CodigoCliente, editado!.Cliente.CodigoCliente);
        Assert.Equal("MARITIMO", editado.MetodoEnvio.Codigo);
        Assert.Equal("SEA999", editado.TrackingExterno);

        // Asignado a embarque: solo tracking, tienda y descripción.
        await AvanzarAsync(paquete.Id, RecibidoEnMiami, PendienteDeEnvio);
        var soloDescripcion = await EnviarPutAsync(agente, paquete.Id,
            Datos(otroCliente.Id, metodo: "MARITIMO", tracking: "SEA999", descripcion: "Licuadora Oster"), HttpStatusCode.OK);
        Assert.Equal("Licuadora Oster", soloDescripcion!.Descripcion);
        using (var cambiarCliente = await agente.PutAsJsonAsync($"/api/packages/{paquete.Id}",
            Datos(paquete.Cliente.Id, metodo: "MARITIMO", descripcion: "Licuadora Oster"), Ct))
        {
            await AssertProblema(cambiarCliente, HttpStatusCode.Conflict, "solo se cambian antes de asignarlo a un embarque");
        }

        // Estado final: nada.
        await EnviarAsync(agente, $"/api/packages/{paquete.Id}/cancel", new { motivo = "Duplicado" }, HttpStatusCode.OK);
        using var final = await agente.PutAsJsonAsync($"/api/packages/{paquete.Id}",
            Datos(otroCliente.Id, metodo: "MARITIMO", descripcion: "X"), Ct);
        await AssertProblema(final, HttpStatusCode.Conflict, "está CANCELADO y ya no se puede modificar");
    }

    [Fact]
    public async Task BuscaYFiltra()
    {
        var maria = await ClienteAsync();
        var jose = await ClienteAsync();
        using var agente = await ComoAsync(CodigosRol.Agente);
        var p1 = await RegistrarAsync(agente, Datos(maria.Id, tracking: "TBA111", descripcion: "Audífonos"));
        var p2 = await RegistrarAsync(agente, Datos(maria.Id, tracking: "1Z999", descripcion: "Zapatos"));
        var p3 = await RegistrarAsync(agente, Datos(jose.Id, metodo: "MARITIMO", descripcion: "Licuadora"));
        await AvanzarAsync(p2.Id, RecibidoEnMiami);

        Assert.Equal([p1.Id], await Ids(agente, "?search=tba111"));
        Assert.Equal([p3.Id], await Ids(agente, "?search=licua"));
        Assert.Equal([p2.Id], await Ids(agente, "?search=PKG-000002"));
        Assert.Equal([p2.Id], await Ids(agente, "?estado=RECIBIDO_EN_MIAMI"));
        Assert.Equal([p2.Id, p1.Id], await Ids(agente, $"?clienteId={maria.Id}")); // más recientes primero
        Assert.Equal([p3.Id], await Ids(agente, "?metodoEnvio=maritimo"));

        using var estadoInvalido = await agente.GetAsync("/api/packages?estado=EXTRAVIADO", Ct);
        await AssertProblema(estadoInvalido, HttpStatusCode.BadRequest, "El estado 'EXTRAVIADO' no existe.");
    }

    [Fact]
    public async Task PaqueteInexistenteResponde404()
    {
        var cliente = await ClienteAsync();
        using var admin = await ComoAsync(CodigosRol.Admin);

        using var get = await admin.GetAsync("/api/packages/999999", Ct);
        using var historial = await admin.GetAsync("/api/packages/999999/history", Ct);
        using var put = await admin.PutAsJsonAsync("/api/packages/999999", Datos(cliente.Id), Ct);
        using var recibir = await admin.PostAsync("/api/packages/999999/receive-miami", null, Ct);
        using var pesar = await admin.PostAsJsonAsync("/api/packages/999999/weigh", new { pesoLb = 1m }, Ct);
        using var cancelar = await admin.PostAsJsonAsync("/api/packages/999999/cancel", new { motivo = "x" }, Ct);

        Assert.All(new[] { get, historial, put, recibir, pesar, cancelar },
            r => Assert.Equal(HttpStatusCode.NotFound, r.StatusCode));
    }

    [Theory]
    [InlineData(CodigosRol.Bodega, "listar", HttpStatusCode.OK)]
    [InlineData(CodigosRol.Bodega, "registrar", HttpStatusCode.Forbidden)]
    [InlineData(CodigosRol.Bodega, "editar", HttpStatusCode.Forbidden)]
    [InlineData(CodigosRol.Bodega, "recibir", HttpStatusCode.OK)]
    [InlineData(CodigosRol.Bodega, "cancelar", HttpStatusCode.Forbidden)]
    [InlineData(CodigosRol.Agente, "registrar", HttpStatusCode.Created)]
    [InlineData(CodigosRol.Agente, "recibir", HttpStatusCode.Forbidden)]
    [InlineData(CodigosRol.Agente, "pesar", HttpStatusCode.Forbidden)]
    [InlineData(CodigosRol.Agente, "cancelar", HttpStatusCode.OK)]
    [InlineData(CodigosRol.Admin, "recibir", HttpStatusCode.OK)]
    [InlineData(CodigosRol.Admin, "editar", HttpStatusCode.OK)]
    [InlineData(CodigosRol.Repartidor, "listar", HttpStatusCode.Forbidden)]
    [InlineData(CodigosRol.Repartidor, "historial", HttpStatusCode.Forbidden)]
    public async Task PermisosPorRol(string rol, string operacion, HttpStatusCode esperado)
    {
        var paquete = await PaqueteAsync();
        using var client = await ComoAsync(rol);

        using var response = operacion switch
        {
            "listar" => await client.GetAsync("/api/packages", Ct),
            "historial" => await client.GetAsync($"/api/packages/{paquete.Id}/history", Ct),
            "registrar" => await client.PostAsJsonAsync("/api/packages", Datos(paquete.Cliente.Id), Ct),
            "editar" => await client.PutAsJsonAsync($"/api/packages/{paquete.Id}", Datos(paquete.Cliente.Id), Ct),
            "recibir" => await client.PostAsync($"/api/packages/{paquete.Id}/receive-miami", null, Ct),
            // El 403 llega antes que la validación del estado: el rol se comprueba primero.
            "pesar" => await client.PostAsJsonAsync($"/api/packages/{paquete.Id}/weigh", new { pesoLb = 1m }, Ct),
            "cancelar" => await client.PostAsJsonAsync($"/api/packages/{paquete.Id}/cancel", new { motivo = "x" }, Ct),
            _ => throw new ArgumentOutOfRangeException(nameof(operacion)),
        };

        Assert.Equal(esperado, response.StatusCode);
    }

    // ---- Preparación de datos ----

    private static object Datos(long clienteId, string metodo = "AEREO", string? tracking = null,
        string? tienda = null, string descripcion = "Audífonos") =>
        new { clienteId, metodoEnvio = metodo, trackingExterno = tracking, tienda, descripcion };

    private async Task<Cliente> ClienteAsync(bool activo = true)
    {
        await using var db = NuevoContexto();
        var cliente = await CrearClienteAsync(db);
        if (!activo)
        {
            cliente.Activo = false;
            await db.SaveChangesAsync(Ct);
        }
        return cliente;
    }

    /// <summary>Paquete recién registrado por la API (así queda su historial inicial).</summary>
    private async Task<PackageResponse> PaqueteAsync(string metodo = "AEREO")
    {
        var cliente = await ClienteAsync();
        using var agente = await ComoAsync(CodigosRol.Agente);
        return await RegistrarAsync(agente, Datos(cliente.Id, metodo));
    }

    /// <summary>
    /// Lleva el paquete por estados que pertenecen a otros módulos (embarques, pagos), insertando
    /// historial directamente como lo harán ellos.
    /// </summary>
    private async Task AvanzarAsync(long paqueteId, params EstadoPaquete[] estados)
    {
        await using var db = NuevoContexto();
        var usuario = await CrearUsuarioAsync(db);
        foreach (var estado in estados)
        {
            db.HistorialEstadosPaquete.Add(new HistorialEstadoPaquete { PaqueteId = paqueteId, EstadoId = estado, UsuarioId = usuario.Id });
            await db.SaveChangesAsync(Ct);
        }
    }

    private async Task AsignarAEmbarqueAsync(long paqueteId)
    {
        await using var db = NuevoContexto();
        var paquete = await db.Paquetes.SingleAsync(p => p.Id == paqueteId, Ct);
        var embarque = new Embarque
        {
            RutaId = await db.Rutas.Select(r => r.Id).SingleAsync(Ct),
            MetodoEnvioId = paquete.MetodoEnvioId,
            CreadoPorUsuarioId = (await CrearUsuarioAsync(db)).Id,
        };
        db.Embarques.Add(embarque);
        await db.SaveChangesAsync(Ct);
        paquete.EmbarqueId = embarque.Id;
        await db.SaveChangesAsync(Ct);
    }

    private async Task FacturarAsync(PackageResponse paquete)
    {
        await using var db = NuevoContexto();
        var factura = new Factura
        {
            ClienteId = paquete.Cliente.Id,
            Subtotal = paquete.MontoCalculado!.Value,
            Total = paquete.MontoCalculado!.Value,
            UsuarioId = (await CrearUsuarioAsync(db)).Id,
        };
        factura.Detalles.Add(new DetalleFactura
        {
            PaqueteId = paquete.Id,
            Descripcion = $"Envío aéreo {paquete.CodigoPaquete}",
            Cantidad = paquete.PesoLb!.Value,
            PrecioUnitario = paquete.TarifaAplicada!.Value,
            Subtotal = paquete.MontoCalculado!.Value,
        });
        db.Facturas.Add(factura);
        await db.SaveChangesAsync(Ct);
    }

    // ---- HTTP ----

    private static async Task<PackageResponse> RegistrarAsync(HttpClient client, object datos)
    {
        using var response = await client.PostAsJsonAsync("/api/packages", datos, Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await Leer<PackageResponse>(response);
    }

    private static async Task<PackageResponse?> EnviarAsync(HttpClient client, string ruta, object cuerpo, HttpStatusCode esperado)
    {
        using var response = await client.PostAsJsonAsync(ruta, cuerpo, Ct);
        Assert.Equal(esperado, response.StatusCode);
        return esperado == HttpStatusCode.OK ? await Leer<PackageResponse>(response) : null;
    }

    private static async Task<PackageResponse?> EnviarPutAsync(HttpClient client, long id, object cuerpo, HttpStatusCode esperado)
    {
        using var response = await client.PutAsJsonAsync($"/api/packages/{id}", cuerpo, Ct);
        Assert.Equal(esperado, response.StatusCode);
        return esperado == HttpStatusCode.OK ? await Leer<PackageResponse>(response) : null;
    }

    private static async Task<IReadOnlyList<PackageHistoryEntry>> Historial(HttpClient client, long id) =>
        (await client.GetFromJsonAsync<List<PackageHistoryEntry>>($"/api/packages/{id}/history", Ct))!;

    private static async Task<long[]> Ids(HttpClient client, string consulta) =>
        (await client.GetFromJsonAsync<PagedResponse<PackageResponse>>($"/api/packages{consulta}", Ct))!
            .Items.Select(p => p.Id).ToArray();

    private static async Task AssertProblema(HttpResponseMessage response, HttpStatusCode estado, string detalleContiene)
    {
        Assert.Equal(estado, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problema = await Leer<JsonElement>(response);
        Assert.Contains(detalleContiene, problema.GetProperty("detail").GetString());
    }

    private static async Task<T> Leer<T>(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<T>(Ct))!;
}
