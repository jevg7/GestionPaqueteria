using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Paqueteria.Api.Auth;
using Paqueteria.Api.DTOs;
using Paqueteria.Api.Entities;
using Paqueteria.Api.Services;
using Paqueteria.IntegrationTests.Infrastructure;

namespace Paqueteria.IntegrationTests;

/// <summary>Entregas (retiro en agencia, delivery, contra entrega) por HTTP contra PostgreSQL real.</summary>
public class EntregasTests(ServidorPostgres servidor) : PruebaHttpConBaseDeDatos(servidor)
{
    private static DateOnly Hoy => CalculoMonto.FechaEnManagua(DateTimeOffset.UtcNow);

    [Fact]
    public async Task RetiroEnAgenciaDeVariosPaquetesPagados()
    {
        var cliente = await ClienteAsync();
        using var agente = await ComoAsync(CodigosRol.Agente);
        using var bodega = await ComoAsync(CodigosRol.Bodega);
        var p1 = await PaquetePagadoAsync(agente, cliente.Id);
        var p2 = await PaquetePagadoAsync(agente, cliente.Id);
        await PrepararAsync(bodega, p1.Id, p2.Id);

        var entregas = (await PostAsync<List<DeliveryResponse>>(agente, "/api/deliveries/pickup",
            new { paqueteIds = new[] { p1.Id, p2.Id }, personaRecibe = "María López" }, HttpStatusCode.Created))!;

        Assert.Equal(2, entregas.Count);
        Assert.All(entregas, e =>
        {
            Assert.Equal(TipoEntrega.RetiroEnAgencia, e.TipoEntrega);
            Assert.Equal(EstadoEntrega.Entregada, e.Estado);
            Assert.Equal("María López", e.PersonaRecibe);
            Assert.Equal("ENTREGADO", e.Paquete.Estado.Codigo);
            Assert.Null(e.CobroPendiente);
        });
        var historial = await GetAsync<List<PackageHistoryEntry>>(agente, $"/api/packages/{p1.Id}/history");
        Assert.Equal(["PAGADO", "LISTO_PARA_ENTREGA", "ENTREGADO"], historial.TakeLast(3).Select(h => h.Estado.Codigo));
    }

    [Fact]
    public async Task PrepararExigePagadoOFacturaEmitida()
    {
        var cliente = await ClienteAsync();
        using var agente = await ComoAsync(CodigosRol.Agente);
        using var bodega = await ComoAsync(CodigosRol.Bodega);
        var registrado = await RegistrarAsync(agente, cliente.Id);
        var sinFactura = await PaquetePesadoAsync(agente, cliente.Id);

        await AssertProblemaAsync(bodega, $"/api/packages/{registrado.Id}/ready", null, HttpStatusCode.Conflict,
            "solo se prepara para entrega un paquete PAGADO o PENDIENTE_DE_PAGO con factura");
        await AssertProblemaAsync(bodega, $"/api/packages/{sinFactura.Id}/ready", null, HttpStatusCode.Conflict,
            "no tiene factura emitida");

        await FacturarAsync(agente, cliente.Id, sinFactura.Id);
        var listo = (await PostAsync<PackageResponse>(bodega, $"/api/packages/{sinFactura.Id}/ready", null, HttpStatusCode.OK))!;
        Assert.Equal("LISTO_PARA_ENTREGA", listo.Estado.Codigo);
        var historial = await GetAsync<List<PackageHistoryEntry>>(agente, $"/api/packages/{sinFactura.Id}/history");
        Assert.Equal("Preparado para entrega contra entrega (factura FAC-000001)", historial[^1].Observacion);
    }

    [Fact]
    public async Task RetiroSinPagarSeCobraPrimeroEnCaja()
    {
        var cliente = await ClienteAsync();
        using var agente = await ComoAsync(CodigosRol.Agente);
        using var bodega = await ComoAsync(CodigosRol.Bodega);
        var paquete = await PaquetePesadoAsync(agente, cliente.Id, 1m); // 3.50 USD
        var factura = await FacturarAsync(agente, cliente.Id, paquete.Id);
        await PrepararAsync(bodega, paquete.Id);
        var retiro = new { paqueteIds = new[] { paquete.Id }, personaRecibe = "María López" };

        await AssertProblemaAsync(agente, "/api/deliveries/pickup", retiro, HttpStatusCode.Conflict,
            "tiene saldo pendiente en la factura FAC-000001 (3.50 USD): regístrelo en caja antes de entregarlo");

        // Pago en caja: la factura queda saldada, pero el paquete sigue LISTO_PARA_ENTREGA (no vuelve a PAGADO).
        await PostAsync<PaymentResponse>(agente, $"/api/invoices/{factura.Id}/payments",
            new { moneda = "USD", monto = 3.50m, metodoPago = "EFECTIVO" }, HttpStatusCode.Created);
        Assert.Equal("LISTO_PARA_ENTREGA", (await GetAsync<PackageResponse>(agente, $"/api/packages/{paquete.Id}")).Estado.Codigo);

        var entregas = (await PostAsync<List<DeliveryResponse>>(agente, "/api/deliveries/pickup", retiro, HttpStatusCode.Created))!;
        Assert.Equal("ENTREGADO", entregas[0].Paquete.Estado.Codigo);
    }

    [Fact]
    public async Task DeliveryCompletoConElRepartidorQueSaleConSusEntregas()
    {
        var cliente = await ClienteAsync(direccion: "Managua, Bolonia, casa 12");
        using var agente = await ComoAsync(CodigosRol.Agente);
        using var bodega = await ComoAsync(CodigosRol.Bodega);
        var (repartidor, repartidorId) = await RepartidorAsync();
        var p1 = await PaquetePagadoAsync(agente, cliente.Id);
        var p2 = await PaquetePagadoAsync(agente, cliente.Id);
        await PrepararAsync(bodega, p1.Id, p2.Id);

        var programadas = (await PostAsync<List<DeliveryResponse>>(agente, "/api/deliveries",
            new { paqueteIds = new[] { p1.Id, p2.Id } }, HttpStatusCode.Created))!;
        Assert.All(programadas, e =>
        {
            Assert.Equal(EstadoEntrega.Pendiente, e.Estado);
            Assert.Equal("Managua, Bolonia, casa 12", e.Direccion); // la del cliente
        });
        var ids = programadas.Select(e => e.Id).ToArray();

        var enRuta = (await PostAsync<List<DeliveryResponse>>(repartidor, "/api/deliveries/dispatch",
            new { entregaIds = ids }, HttpStatusCode.OK))!;
        Assert.All(enRuta, e =>
        {
            Assert.Equal(EstadoEntrega.EnRuta, e.Estado);
            Assert.Equal(repartidorId, e.Responsable!.Id);
            Assert.Equal("EN_REPARTO", e.Paquete.Estado.Codigo);
            Assert.Equal(cliente.Telefono, e.Cliente.Telefono); // el repartidor necesita llamar
        });

        var resultado = (await PostAsync<DeliverResponse>(repartidor, "/api/deliveries/deliver",
            new { entregaIds = ids, personaRecibe = "José López (hermano)" }, HttpStatusCode.OK))!;
        Assert.Empty(resultado.Cobros);
        Assert.All(resultado.Entregas, e =>
        {
            Assert.Equal(EstadoEntrega.Entregada, e.Estado);
            Assert.Equal("ENTREGADO", e.Paquete.Estado.Codigo);
            Assert.NotNull(e.FechaEntrega);
        });
    }

    [Fact]
    public async Task DeliveryContraEntregaCobraElSaldoEnCordobas()
    {
        var cliente = await ClienteAsync(direccion: "León, del parque 2c al sur");
        using var agente = await ComoAsync(CodigosRol.Agente);
        using var bodega = await ComoAsync(CodigosRol.Bodega);
        using var admin = await ComoAsync(CodigosRol.Admin);
        var (repartidor, repartidorId) = await RepartidorAsync();
        await PutAsync(admin, $"/api/exchange-rates/{Hoy:yyyy-MM-dd}", new { nioPorUsd = 36.6243m });
        var paquete = await PaquetePesadoAsync(agente, cliente.Id, 4.5m); // 15.75 USD
        var factura = await FacturarAsync(agente, cliente.Id, paquete.Id);
        await PrepararAsync(bodega, paquete.Id);
        var entrega = (await PostAsync<List<DeliveryResponse>>(agente, "/api/deliveries",
            new { paqueteIds = new[] { paquete.Id }, responsableUsuarioId = repartidorId }, HttpStatusCode.Created))!.Single();
        Assert.Equal(new PendingCharge(factura.Id, "FAC-000001", 15.75m), entrega.CobroPendiente);
        await PostAsync<List<DeliveryResponse>>(repartidor, "/api/deliveries/dispatch", new { entregaIds = new[] { entrega.Id } }, HttpStatusCode.OK);

        await AssertProblemaAsync(repartidor, "/api/deliveries/deliver",
            new { entregaIds = new[] { entrega.Id }, personaRecibe = "Ana" }, HttpStatusCode.Conflict,
            "La factura FAC-000001 tiene saldo pendiente (15.75 USD): registre el cobro contra entrega");

        var resultado = (await PostAsync<DeliverResponse>(repartidor, "/api/deliveries/deliver", new
        {
            entregaIds = new[] { entrega.Id },
            personaRecibe = "Ana",
            cobro = new { moneda = "NIO", metodoPago = "EFECTIVO" },
        }, HttpStatusCode.OK))!;

        var cobro = Assert.Single(resultado.Cobros);
        Assert.Equal(Moneda.Nio, cobro.Moneda);
        Assert.Equal(576.83m, cobro.MontoMoneda);          // 15.75 × 36.6243
        Assert.Equal(15.75m, cobro.Monto);
        Assert.Equal(repartidorId, cobro.UsuarioId);        // quién cobró: para el cuadre de caja
        Assert.Equal("ENTREGADO", resultado.Entregas.Single().Paquete.Estado.Codigo);
        Assert.Null(resultado.Entregas.Single().CobroPendiente);
        Assert.Equal(EstadoPagoFactura.Pagada, (await GetAsync<InvoiceResponse>(agente, $"/api/invoices/{factura.Id}")).EstadoPago);
    }

    [Fact]
    public async Task DeliveryFallidoSeReprograma()
    {
        var cliente = await ClienteAsync();
        using var agente = await ComoAsync(CodigosRol.Agente);
        using var bodega = await ComoAsync(CodigosRol.Bodega);
        var (_, repartidorId) = await RepartidorAsync();
        var paquete = await PaquetePagadoAsync(agente, cliente.Id);
        await PrepararAsync(bodega, paquete.Id);
        var entrega = (await PostAsync<List<DeliveryResponse>>(agente, "/api/deliveries",
            new { paqueteIds = new[] { paquete.Id }, direccion = "Masaya, frente a la iglesia" }, HttpStatusCode.Created))!.Single();

        using (var sinRepartidor = await agente.PostAsJsonAsync("/api/deliveries/dispatch", new { entregaIds = new[] { entrega.Id } }, Ct))
        {
            await AssertDetalle(sinRepartidor, HttpStatusCode.BadRequest, $"Indique el repartidor de la entrega {entrega.Id}.");
        }
        await PostAsync<List<DeliveryResponse>>(agente, "/api/deliveries/dispatch",
            new { entregaIds = new[] { entrega.Id }, responsableUsuarioId = repartidorId }, HttpStatusCode.OK);

        var fallida = (await PostAsync<List<DeliveryResponse>>(agente, "/api/deliveries/fail",
            new { entregaIds = new[] { entrega.Id }, motivo = "Nadie en casa" }, HttpStatusCode.OK))!.Single();
        Assert.Equal(EstadoEntrega.Fallida, fallida.Estado);
        Assert.Equal("LISTO_PARA_ENTREGA", fallida.Paquete.Estado.Codigo);
        Assert.Contains("Fallida: Nadie en casa", fallida.Observaciones);

        // El intento fallido ya no es vigente: se puede programar otro.
        var otra = (await PostAsync<List<DeliveryResponse>>(agente, "/api/deliveries",
            new { paqueteIds = new[] { paquete.Id }, direccion = "Masaya, frente a la iglesia" }, HttpStatusCode.Created))!.Single();
        Assert.NotEqual(entrega.Id, otra.Id);
        var historial = await GetAsync<List<PackageHistoryEntry>>(agente, $"/api/packages/{paquete.Id}/history");
        Assert.Equal("Entrega fallida: Nadie en casa", historial[^1].Observacion);
    }

    [Fact]
    public async Task UnSoloIntentoVigenteYCancelacion()
    {
        var cliente = await ClienteAsync(direccion: "Granada");
        using var agente = await ComoAsync(CodigosRol.Agente);
        using var bodega = await ComoAsync(CodigosRol.Bodega);
        var paquete = await PaquetePagadoAsync(agente, cliente.Id);
        await PrepararAsync(bodega, paquete.Id);
        var entrega = (await PostAsync<List<DeliveryResponse>>(agente, "/api/deliveries",
            new { paqueteIds = new[] { paquete.Id } }, HttpStatusCode.Created))!.Single();

        await AssertProblemaAsync(agente, "/api/deliveries", new { paqueteIds = new[] { paquete.Id } },
            HttpStatusCode.Conflict, $"ya tiene la entrega {entrega.Id} PENDIENTE");
        await AssertProblemaAsync(agente, "/api/deliveries/pickup", new { paqueteIds = new[] { paquete.Id }, personaRecibe = "X" },
            HttpStatusCode.Conflict, $"ya tiene la entrega {entrega.Id} PENDIENTE");

        var cancelada = (await PostAsync<List<DeliveryResponse>>(agente, "/api/deliveries/cancel",
            new { entregaIds = new[] { entrega.Id }, motivo = "El cliente pasará a retirarlo" }, HttpStatusCode.OK))!.Single();
        Assert.Equal(EstadoEntrega.Cancelada, cancelada.Estado);
        Assert.Equal("LISTO_PARA_ENTREGA", cancelada.Paquete.Estado.Codigo);
        await PostAsync<List<DeliveryResponse>>(agente, "/api/deliveries/pickup",
            new { paqueteIds = new[] { paquete.Id }, personaRecibe = "María López" }, HttpStatusCode.Created);
    }

    [Fact]
    public async Task UnaVisitaEsDeUnSoloCliente()
    {
        var maria = await ClienteAsync(direccion: "Managua");
        var jose = await ClienteAsync(direccion: "Managua");
        using var agente = await ComoAsync(CodigosRol.Agente);
        using var bodega = await ComoAsync(CodigosRol.Bodega);
        var deMaria = await PaquetePagadoAsync(agente, maria.Id);
        var deJose = await PaquetePagadoAsync(agente, jose.Id);
        await PrepararAsync(bodega, deMaria.Id, deJose.Id);

        await AssertProblemaAsync(agente, "/api/deliveries", new { paqueteIds = new[] { deMaria.Id, deJose.Id } },
            HttpStatusCode.Conflict, "Los paquetes de una misma entrega deben ser del mismo cliente.");
    }

    [Fact]
    public async Task SinDireccionNiDireccionDelClienteResponde400()
    {
        var cliente = await ClienteAsync(direccion: null);
        using var agente = await ComoAsync(CodigosRol.Agente);
        using var bodega = await ComoAsync(CodigosRol.Bodega);
        var paquete = await PaquetePagadoAsync(agente, cliente.Id);
        await PrepararAsync(bodega, paquete.Id);

        await AssertProblemaAsync(agente, "/api/deliveries", new { paqueteIds = new[] { paquete.Id } },
            HttpStatusCode.BadRequest, $"el cliente {cliente.CodigoCliente} no tiene una registrada");
    }

    [Fact]
    public async Task ElRepartidorNoVeNiOperaEntregasDeOtroYElAgentePuedeConfirmarEnSuNombre()
    {
        var cliente = await ClienteAsync(direccion: "Managua");
        using var agente = await ComoAsync(CodigosRol.Agente);
        using var bodega = await ComoAsync(CodigosRol.Bodega);
        var (repartidorA, idA) = await RepartidorAsync();
        var (repartidorB, idB) = await RepartidorAsync();
        var paquete = await PaquetePagadoAsync(agente, cliente.Id);
        await PrepararAsync(bodega, paquete.Id);
        var entrega = (await PostAsync<List<DeliveryResponse>>(agente, "/api/deliveries",
            new { paqueteIds = new[] { paquete.Id }, responsableUsuarioId = idA }, HttpStatusCode.Created))!.Single();

        Assert.Empty((await GetAsync<PagedResponse<DeliveryResponse>>(repartidorB, "/api/deliveries")).Items);
        using (var ver = await repartidorB.GetAsync($"/api/deliveries/{entrega.Id}", Ct))
        {
            Assert.Equal(HttpStatusCode.NotFound, ver.StatusCode);
        }
        await AssertProblemaAsync(repartidorB, "/api/deliveries/dispatch", new { entregaIds = new[] { entrega.Id } },
            HttpStatusCode.BadRequest, $"No existen las entregas con id {entrega.Id}.");

        await AssertProblemaAsync(repartidorA, "/api/deliveries/dispatch", new { entregaIds = new[] { entrega.Id }, responsableUsuarioId = idB },
            HttpStatusCode.Forbidden, "Un repartidor solo puede salir a ruta con sus propias entregas.");
        await PostAsync<List<DeliveryResponse>>(repartidorA, "/api/deliveries/dispatch", new { entregaIds = new[] { entrega.Id } }, HttpStatusCode.OK);
        Assert.Single((await GetAsync<PagedResponse<DeliveryResponse>>(repartidorA, "/api/deliveries")).Items);

        // El repartidor avisa por teléfono y el agente confirma en su nombre.
        var resultado = (await PostAsync<DeliverResponse>(agente, "/api/deliveries/deliver",
            new { entregaIds = new[] { entrega.Id }, personaRecibe = "María López" }, HttpStatusCode.OK))!;
        Assert.Equal(EstadoEntrega.Entregada, resultado.Entregas.Single().Estado);
    }

    [Fact]
    public async Task ResponsableDebeSerRepartidorActivo()
    {
        var cliente = await ClienteAsync(direccion: "Managua");
        using var agente = await ComoAsync(CodigosRol.Agente);
        using var bodega = await ComoAsync(CodigosRol.Bodega);
        var (_, bodegueroId) = await EmpleadoAsync(CodigosRol.Bodega);
        var paquete = await PaquetePagadoAsync(agente, cliente.Id);
        await PrepararAsync(bodega, paquete.Id);

        await AssertProblemaAsync(agente, "/api/deliveries", new { paqueteIds = new[] { paquete.Id }, responsableUsuarioId = bodegueroId },
            HttpStatusCode.BadRequest, $"El usuario {bodegueroId} no es un repartidor activo.");
    }

    [Fact]
    public async Task NoSeAnulaLaFacturaDeUnPaquetePreparadoParaEntrega()
    {
        var cliente = await ClienteAsync();
        using var agente = await ComoAsync(CodigosRol.Agente);
        using var bodega = await ComoAsync(CodigosRol.Bodega);
        using var admin = await ComoAsync(CodigosRol.Admin);
        var paquete = await PaquetePesadoAsync(agente, cliente.Id);
        var factura = await FacturarAsync(agente, cliente.Id, paquete.Id);
        await PrepararAsync(bodega, paquete.Id);

        await AssertProblemaAsync(admin, $"/api/invoices/{factura.Id}/void", new { motivo = "x" }, HttpStatusCode.Conflict,
            $"El paquete {paquete.CodigoPaquete} ya está LISTO_PARA_ENTREGA: no se puede anular la factura FAC-000001.");
    }

    [Fact]
    public async Task AnularUnPagoDeUnPaquetePreparadoLoDejaListoPeroConSaldo()
    {
        var cliente = await ClienteAsync();
        using var agente = await ComoAsync(CodigosRol.Agente);
        using var bodega = await ComoAsync(CodigosRol.Bodega);
        using var admin = await ComoAsync(CodigosRol.Admin);
        var paquete = await PaquetePagadoAsync(agente, cliente.Id);
        await PrepararAsync(bodega, paquete.Id);
        var factura = await GetAsync<PagedResponse<InvoiceSummaryResponse>>(agente, $"/api/invoices?clienteId={cliente.Id}");
        var detalle = await GetAsync<InvoiceResponse>(agente, $"/api/invoices/{factura.Items.Single().Id}");

        await PostAsync<PaymentResponse>(admin, $"/api/payments/{detalle.Pagos.Single().Id}/void", new { motivo = "Billete falso" }, HttpStatusCode.OK);

        Assert.Equal("LISTO_PARA_ENTREGA", (await GetAsync<PackageResponse>(agente, $"/api/packages/{paquete.Id}")).Estado.Codigo);
        await AssertProblemaAsync(agente, "/api/deliveries/pickup", new { paqueteIds = new[] { paquete.Id }, personaRecibe = "X" },
            HttpStatusCode.Conflict, "tiene saldo pendiente");
    }

    [Theory]
    [InlineData(CodigosRol.Bodega, "preparar", HttpStatusCode.OK)]
    [InlineData(CodigosRol.Repartidor, "preparar", HttpStatusCode.Forbidden)]
    [InlineData(CodigosRol.Bodega, "programar", HttpStatusCode.Forbidden)]
    [InlineData(CodigosRol.Repartidor, "programar", HttpStatusCode.Forbidden)]
    [InlineData(CodigosRol.Repartidor, "retiro", HttpStatusCode.Forbidden)]
    [InlineData(CodigosRol.Bodega, "listar", HttpStatusCode.OK)]
    [InlineData(CodigosRol.Repartidor, "listar", HttpStatusCode.OK)]
    [InlineData(CodigosRol.Bodega, "despachar", HttpStatusCode.Forbidden)]
    [InlineData(CodigosRol.Repartidor, "cancelar", HttpStatusCode.Forbidden)]
    public async Task PermisosPorRol(string rol, string operacion, HttpStatusCode esperado)
    {
        var cliente = await ClienteAsync(direccion: "Managua");
        using var agente = await ComoAsync(CodigosRol.Agente);
        var paquete = await PaquetePagadoAsync(agente, cliente.Id);
        using var client = await ComoAsync(rol);

        using var response = operacion switch
        {
            "preparar" => await client.PostAsync($"/api/packages/{paquete.Id}/ready", null, Ct),
            "programar" => await client.PostAsJsonAsync("/api/deliveries", new { paqueteIds = new[] { paquete.Id } }, Ct),
            "retiro" => await client.PostAsJsonAsync("/api/deliveries/pickup", new { paqueteIds = new[] { paquete.Id }, personaRecibe = "X" }, Ct),
            "listar" => await client.GetAsync("/api/deliveries", Ct),
            "despachar" => await client.PostAsJsonAsync("/api/deliveries/dispatch", new { entregaIds = new[] { 1L } }, Ct),
            "cancelar" => await client.PostAsJsonAsync("/api/deliveries/cancel", new { entregaIds = new[] { 1L }, motivo = "x" }, Ct),
            _ => throw new ArgumentOutOfRangeException(nameof(operacion)),
        };

        Assert.Equal(esperado, response.StatusCode);
    }

    // ---- Preparación ----

    private async Task<Cliente> ClienteAsync(string? direccion = "Managua, Altamira")
    {
        await using var db = NuevoContexto();
        var cliente = await CrearClienteAsync(db);
        cliente.Direccion = direccion;
        await db.SaveChangesAsync(Ct);
        return cliente;
    }

    private async Task<(HttpClient Client, long UsuarioId)> EmpleadoAsync(string rol)
    {
        var (usuario, authUserId) = await CrearEmpleadoAsync(roles: [rol]);
        return (Api.Client(TokensDePrueba.Crear(authUserId)), usuario.Id);
    }

    private Task<(HttpClient Client, long UsuarioId)> RepartidorAsync() => EmpleadoAsync(CodigosRol.Repartidor);

    private static async Task<PackageResponse> RegistrarAsync(HttpClient agente, long clienteId) =>
        (await PostAsync<PackageResponse>(agente, "/api/packages",
            new { clienteId, metodoEnvio = "AEREO", descripcion = "Audífonos" }, HttpStatusCode.Created))!;

    /// <summary>Paquete pesado (PENDIENTE_DE_PAGO, tarifa aérea 3.50). El recorrido por embarques ya lo prueba EmbarquesTests.</summary>
    private async Task<PackageResponse> PaquetePesadoAsync(HttpClient agente, long clienteId, decimal pesoLb = 1m)
    {
        using var bodega = await ComoAsync(CodigosRol.Bodega);
        var paquete = await RegistrarAsync(agente, clienteId);
        await using (var db = NuevoContexto())
        {
            var usuario = await CrearUsuarioAsync(db);
            foreach (var estado in new[] { EstadoPaquete.RecibidoEnMiami, EstadoPaquete.PendienteDeEnvio, EstadoPaquete.EnTransito, EstadoPaquete.RecibidoEnNicaragua })
            {
                db.HistorialEstadosPaquete.Add(new HistorialEstadoPaquete { PaqueteId = paquete.Id, EstadoId = estado, UsuarioId = usuario.Id });
                await db.SaveChangesAsync(Ct);
            }
        }
        return (await PostAsync<PackageResponse>(bodega, $"/api/packages/{paquete.Id}/weigh", new { pesoLb }, HttpStatusCode.OK))!;
    }

    private static async Task<InvoiceResponse> FacturarAsync(HttpClient agente, long clienteId, params long[] paqueteIds) =>
        (await PostAsync<InvoiceResponse>(agente, "/api/invoices", new { clienteId, paqueteIds }, HttpStatusCode.Created))!;

    /// <summary>Paquete facturado y pagado en USD (queda PAGADO).</summary>
    private async Task<PackageResponse> PaquetePagadoAsync(HttpClient agente, long clienteId)
    {
        var paquete = await PaquetePesadoAsync(agente, clienteId);
        var factura = await FacturarAsync(agente, clienteId, paquete.Id);
        await PostAsync<PaymentResponse>(agente, $"/api/invoices/{factura.Id}/payments",
            new { moneda = "USD", monto = factura.Total, metodoPago = "EFECTIVO" }, HttpStatusCode.Created);
        return paquete;
    }

    private static async Task PrepararAsync(HttpClient bodega, params long[] paqueteIds)
    {
        foreach (var id in paqueteIds)
        {
            await PostAsync<PackageResponse>(bodega, $"/api/packages/{id}/ready", null, HttpStatusCode.OK);
        }
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

    private static async Task PutAsync(HttpClient client, string ruta, object cuerpo)
    {
        using var response = await client.PutAsJsonAsync(ruta, cuerpo, JsonApi.Opciones, Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    private static async Task<T> GetAsync<T>(HttpClient client, string ruta) =>
        (await client.GetFromJsonAsync<T>(ruta, JsonApi.Opciones, Ct))!;

    private static async Task AssertProblemaAsync(HttpClient client, string ruta, object? cuerpo, HttpStatusCode estado, string detalleContiene)
    {
        using var response = cuerpo is null
            ? await client.PostAsync(ruta, null, Ct)
            : await client.PostAsJsonAsync(ruta, cuerpo, JsonApi.Opciones, Ct);
        await AssertDetalle(response, estado, detalleContiene);
    }

    private static async Task AssertDetalle(HttpResponseMessage response, HttpStatusCode estado, string detalleContiene)
    {
        if (response.StatusCode != estado)
        {
            Assert.Fail($"Se esperaba {estado} y se obtuvo {response.StatusCode}: {await response.Content.ReadAsStringAsync(Ct)}");
        }
        var problema = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        Assert.Contains(detalleContiene, problema.GetProperty("detail").GetString());
    }
}
