using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Paqueteria.Api.Auth;
using Paqueteria.Api.DTOs;
using Paqueteria.Api.Entities;
using Paqueteria.Api.Services;
using Paqueteria.IntegrationTests.Infrastructure;

namespace Paqueteria.IntegrationTests;

/// <summary>Facturación y pagos (USD y córdobas) por HTTP contra PostgreSQL real, con la migración PagosEnCordobas.</summary>
public class FacturacionTests(ServidorPostgres servidor) : PruebaHttpConBaseDeDatos(servidor)
{
    private static DateOnly Hoy => CalculoMonto.FechaEnManagua(DateTimeOffset.UtcNow);

    [Fact]
    public async Task EmitirUnaFacturaConVariosPaquetes()
    {
        var cliente = await ClienteAsync();
        var p1 = await PaquetePendienteDePagoAsync(cliente.Id, 4.5m);  // 15.75
        var p2 = await PaquetePendienteDePagoAsync(cliente.Id, 2.25m); // 7.88
        using var agente = await ComoAsync(CodigosRol.Agente);

        var factura = (await PostAsync<InvoiceResponse>(agente, "/api/invoices",
            new { clienteId = cliente.Id, paqueteIds = new[] { p1.Id, p2.Id } }, HttpStatusCode.Created))!;

        Assert.Equal("FAC-000001", factura.NumeroFactura);
        Assert.Equal(Moneda.Usd, factura.Moneda);
        Assert.Equal(23.63m, factura.Subtotal);
        Assert.Equal(0m, factura.Impuestos);
        Assert.Equal(23.63m, factura.Total);
        Assert.Equal(23.63m, factura.Saldo);
        Assert.Equal(EstadoPagoFactura.Pendiente, factura.EstadoPago);
        Assert.Equal(2, factura.Lineas.Count);
        Assert.Equal($"Envío aéreo {p1.CodigoPaquete}: 4.50 lb × 3.50 USD/lb", factura.Lineas[0].Descripcion);
        Assert.Equal(p1.CodigoPaquete, factura.Lineas[0].CodigoPaquete);
    }

    [Fact]
    public async Task EmitirRechazaLoQueNoSePuedeFacturar()
    {
        var maria = await ClienteAsync();
        var jose = await ClienteAsync();
        var deMaria = await PaquetePendienteDePagoAsync(maria.Id, 1m);
        var deJose = await PaquetePendienteDePagoAsync(jose.Id, 1m);
        using var agente = await ComoAsync(CodigosRol.Agente);
        var soloRegistrado = await RegistrarPaqueteAsync(agente, maria.Id);

        await AssertProblemaAsync(agente, "/api/invoices", new { clienteId = maria.Id, paqueteIds = new[] { deJose.Id } },
            HttpStatusCode.Conflict, $"El paquete {deJose.CodigoPaquete} no es del cliente {maria.CodigoCliente}.");
        await AssertProblemaAsync(agente, "/api/invoices", new { clienteId = maria.Id, paqueteIds = new[] { soloRegistrado.Id } },
            HttpStatusCode.Conflict, "está REGISTRADO: solo se facturan paquetes PENDIENTE_DE_PAGO");
        await AssertProblemaAsync(agente, "/api/invoices", new { clienteId = maria.Id, paqueteIds = new[] { 999999L } },
            HttpStatusCode.BadRequest, "No existen los paquetes con id 999999.");
        await AssertProblemaAsync(agente, "/api/invoices", new { clienteId = 999999L, paqueteIds = new[] { deMaria.Id } },
            HttpStatusCode.BadRequest, "El cliente 999999 no existe.");

        await PostAsync<InvoiceResponse>(agente, "/api/invoices", new { clienteId = maria.Id, paqueteIds = new[] { deMaria.Id } }, HttpStatusCode.Created);
        await AssertProblemaAsync(agente, "/api/invoices", new { clienteId = maria.Id, paqueteIds = new[] { deMaria.Id } },
            HttpStatusCode.Conflict, $"El paquete {deMaria.CodigoPaquete} ya está en la factura FAC-000001.");
    }

    [Fact]
    public async Task PagosParcialesHastaSaldarPasanLosPaquetesAPagado()
    {
        var (factura, paquete, agente) = await FacturaDeUnPaqueteAsync(4.5m); // 15.75

        var parcial = (await PagarAsync(agente, factura.Id, "USD", 10m, HttpStatusCode.Created))!;
        Assert.Equal(10m, parcial.Monto);
        Assert.Null(parcial.MontoMoneda);
        var tras1 = await GetAsync<InvoiceResponse>(agente, $"/api/invoices/{factura.Id}");
        Assert.Equal(EstadoPagoFactura.Parcial, tras1.EstadoPago);
        Assert.Equal(5.75m, tras1.Saldo);
        Assert.Equal("PENDIENTE_DE_PAGO", (await GetAsync<PackageResponse>(agente, $"/api/packages/{paquete.Id}")).Estado.Codigo);

        await PagarAsync(agente, factura.Id, "USD", 5.75m, HttpStatusCode.Created, "TRANSFERENCIA", "BAC-778899");

        var saldada = await GetAsync<InvoiceResponse>(agente, $"/api/invoices/{factura.Id}");
        Assert.Equal(EstadoPagoFactura.Pagada, saldada.EstadoPago);
        Assert.Equal(0m, saldada.Saldo);
        Assert.Equal(2, saldada.Pagos.Count);
        Assert.Equal("PAGADO", (await GetAsync<PackageResponse>(agente, $"/api/packages/{paquete.Id}")).Estado.Codigo);
        var historial = await GetAsync<List<PackageHistoryEntry>>(agente, $"/api/packages/{paquete.Id}/history");
        Assert.Equal("Factura FAC-000001 pagada", historial[^1].Observacion);
    }

    [Fact]
    public async Task PagoEnCordobasConElTipoDeCambioVigenteYSaldoExacto()
    {
        var (factura, paquete, agente) = await FacturaDeUnPaqueteAsync(4.5m); // 15.75 USD
        using var admin = await ComoAsync(CodigosRol.Admin);
        await TipoCambioAsync(admin, Hoy, 36.6243m);

        var parcial = (await PagarAsync(agente, factura.Id, "NIO", 300m, HttpStatusCode.Created))!;
        Assert.Equal(Moneda.Nio, parcial.Moneda);
        Assert.Equal(300m, parcial.MontoMoneda);
        Assert.Equal(36.6243m, parcial.TipoCambioAplicado);
        Assert.Equal(8.19m, parcial.Monto); // 300 / 36.6243 = 8.1913…

        // Saldo 7.56 USD = C$ 276.88: pagarlo en córdobas salda exacto.
        var saldo = (await GetAsync<InvoiceResponse>(agente, $"/api/invoices/{factura.Id}")).Saldo;
        Assert.Equal(7.56m, saldo);
        await PagarAsync(agente, factura.Id, "NIO", CalculoMonto.ACordobas(saldo, 36.6243m), HttpStatusCode.Created);

        var saldada = await GetAsync<InvoiceResponse>(agente, $"/api/invoices/{factura.Id}");
        Assert.Equal(0m, saldada.Saldo);
        Assert.Equal("PAGADO", (await GetAsync<PackageResponse>(agente, $"/api/packages/{paquete.Id}")).Estado.Codigo);
    }

    [Fact]
    public async Task PagoEnCordobasSinTipoDeCambioResponde409()
    {
        var (factura, _, agente) = await FacturaDeUnPaqueteAsync(1m);

        using var response = await agente.PostAsJsonAsync($"/api/invoices/{factura.Id}/payments",
            new { moneda = "NIO", monto = 100m, metodoPago = "EFECTIVO" }, Ct);

        await AssertDetalle(response, HttpStatusCode.Conflict, "No hay un tipo de cambio registrado");
    }

    [Fact]
    public async Task PagoQueExcedeElSaldoResponde409ConElSaldoEnAmbasMonedas()
    {
        var (factura, _, agente) = await FacturaDeUnPaqueteAsync(4.5m); // 15.75
        using var admin = await ComoAsync(CodigosRol.Admin);
        await TipoCambioAsync(admin, Hoy, 36.6243m);

        using var enDolares = await agente.PostAsJsonAsync($"/api/invoices/{factura.Id}/payments",
            new { moneda = "USD", monto = 15.76m, metodoPago = "EFECTIVO" }, Ct);
        using var enCordobas = await agente.PostAsJsonAsync($"/api/invoices/{factura.Id}/payments",
            new { moneda = "NIO", monto = 600m, metodoPago = "EFECTIVO" }, Ct);

        await AssertDetalle(enDolares, HttpStatusCode.Conflict, "El pago (15.76 USD) excede el saldo de la factura FAC-000001 (15.75 USD).");
        await AssertDetalle(enCordobas, HttpStatusCode.Conflict, "(15.75 USD = C$ 576.83 al tipo de cambio 36.6243");
    }

    [Theory]
    [InlineData("{\"moneda\":\"EUR\",\"monto\":10,\"metodoPago\":\"EFECTIVO\"}")]
    [InlineData("{\"monto\":10,\"metodoPago\":\"EFECTIVO\"}")]
    [InlineData("{\"moneda\":\"USD\",\"monto\":0,\"metodoPago\":\"EFECTIVO\"}")]
    [InlineData("{\"moneda\":\"USD\",\"monto\":1.005,\"metodoPago\":\"EFECTIVO\"}")]
    [InlineData("{\"moneda\":\"USD\",\"monto\":10}")]
    public async Task PagoInvalidoResponde400(string json)
    {
        var (factura, _, agente) = await FacturaDeUnPaqueteAsync(4.5m);

        using var response = await agente.PostAsync($"/api/invoices/{factura.Id}/payments",
            new StringContent(json, System.Text.Encoding.UTF8, "application/json"), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task AnularFacturaSinPagosPermiteVolverAFacturar()
    {
        var (factura, paquete, agente) = await FacturaDeUnPaqueteAsync(1m);
        using var admin = await ComoAsync(CodigosRol.Admin);

        using (var sinMotivo = await admin.PostAsJsonAsync($"/api/invoices/{factura.Id}/void", new { motivo = " " }, Ct))
        {
            Assert.Equal(HttpStatusCode.BadRequest, sinMotivo.StatusCode);
        }
        var anulada = (await PostAsync<InvoiceResponse>(admin, $"/api/invoices/{factura.Id}/void",
            new { motivo = "Cliente equivocado" }, HttpStatusCode.OK))!;
        Assert.Equal(EstadoFactura.Anulada, anulada.Estado);
        Assert.Equal(EstadoPagoFactura.Anulada, anulada.EstadoPago);
        Assert.Equal("Cliente equivocado", anulada.MotivoAnulacion);
        Assert.NotNull(anulada.AnuladaEn);

        await AssertProblemaAsync(agente, $"/api/invoices/{factura.Id}/payments",
            new { moneda = "USD", monto = 1m, metodoPago = "EFECTIVO" }, HttpStatusCode.Conflict, "está anulada: no admite pagos");
        var otra = (await PostAsync<InvoiceResponse>(agente, "/api/invoices",
            new { clienteId = anulada.Cliente.Id, paqueteIds = new[] { paquete.Id } }, HttpStatusCode.Created))!;
        Assert.Equal("FAC-000002", otra.NumeroFactura);
    }

    [Fact]
    public async Task NoSeAnulaUnaFacturaConPagosAplicados()
    {
        var (factura, _, agente) = await FacturaDeUnPaqueteAsync(4.5m);
        await PagarAsync(agente, factura.Id, "USD", 5m, HttpStatusCode.Created);
        using var admin = await ComoAsync(CodigosRol.Admin);

        await AssertProblemaAsync(admin, $"/api/invoices/{factura.Id}/void", new { motivo = "x" },
            HttpStatusCode.Conflict, "tiene pagos aplicados: anúlelos antes de anular la factura");
    }

    [Fact]
    public async Task AnularUnPagoDeUnaFacturaSaldadaDevuelveLosPaquetesAPendiente()
    {
        var (factura, paquete, agente) = await FacturaDeUnPaqueteAsync(1m); // 3.50
        var pago = (await PagarAsync(agente, factura.Id, "USD", 3.50m, HttpStatusCode.Created))!;
        Assert.Equal("PAGADO", (await GetAsync<PackageResponse>(agente, $"/api/packages/{paquete.Id}")).Estado.Codigo);
        using var admin = await ComoAsync(CodigosRol.Admin);

        var anulado = (await PostAsync<PaymentResponse>(admin, $"/api/payments/{pago.Id}/void",
            new { motivo = "Billete falso" }, HttpStatusCode.OK))!;

        Assert.Equal(EstadoPago.Anulado, anulado.Estado);
        Assert.Equal("Billete falso", anulado.MotivoAnulacion);
        var factura2 = await GetAsync<InvoiceResponse>(agente, $"/api/invoices/{factura.Id}");
        Assert.Equal(EstadoPagoFactura.Pendiente, factura2.EstadoPago);
        Assert.Equal(3.50m, factura2.Saldo);
        Assert.Equal("PENDIENTE_DE_PAGO", (await GetAsync<PackageResponse>(agente, $"/api/packages/{paquete.Id}")).Estado.Codigo);

        await AssertProblemaAsync(admin, $"/api/payments/{pago.Id}/void", new { motivo = "otra vez" },
            HttpStatusCode.Conflict, "ya está anulado");
    }

    [Fact]
    public async Task NoSeAnulaElPagoSiUnPaqueteYaFueEntregado()
    {
        var (factura, paquete, agente) = await FacturaDeUnPaqueteAsync(1m);
        var pago = (await PagarAsync(agente, factura.Id, "USD", 3.50m, HttpStatusCode.Created))!;
        await AvanzarAsync(paquete.Id, EstadoPaquete.ListoParaEntrega, EstadoPaquete.Entregado);
        using var admin = await ComoAsync(CodigosRol.Admin);

        await AssertProblemaAsync(admin, $"/api/payments/{pago.Id}/void", new { motivo = "x" },
            HttpStatusCode.Conflict, $"El paquete {paquete.CodigoPaquete} de la factura FAC-000001 ya está ENTREGADO");

        var sinCambios = await GetAsync<InvoiceResponse>(agente, $"/api/invoices/{factura.Id}");
        Assert.Equal(EstadoPago.Aplicado, sinCambios.Pagos[0].Estado);
    }

    [Fact]
    public async Task DosPagosSimultaneosDelSaldoCompletoSoloAplicanUno()
    {
        var (factura, _, agente) = await FacturaDeUnPaqueteAsync(4.5m);
        using var agente2 = await ComoAsync(CodigosRol.Agente);
        var cuerpo = new { moneda = "USD", monto = 15.75m, metodoPago = "EFECTIVO" };

        var respuestas = await Task.WhenAll(
            agente.PostAsJsonAsync($"/api/invoices/{factura.Id}/payments", cuerpo, Ct),
            agente2.PostAsJsonAsync($"/api/invoices/{factura.Id}/payments", cuerpo, Ct));

        Assert.Equal([HttpStatusCode.Created, HttpStatusCode.Conflict], respuestas.Select(r => r.StatusCode).Order());
        await using var db = NuevoContexto();
        Assert.Equal(1, await db.Pagos.CountAsync(p => p.FacturaId == factura.Id, Ct));
        foreach (var respuesta in respuestas)
        {
            respuesta.Dispose();
        }
    }

    [Fact]
    public async Task LaBdExigeCoherenciaEnPagosEnCordobasYLosHaceInmutables()
    {
        var (factura, _, agente) = await FacturaDeUnPaqueteAsync(4.5m);
        using var admin = await ComoAsync(CodigosRol.Admin);
        await TipoCambioAsync(admin, Hoy, 36.6243m);
        var pago = (await PagarAsync(agente, factura.Id, "NIO", 300m, HttpStatusCode.Created))!;

        await using (var db = NuevoContexto())
        {
            // monto no es round(300 / 36.6243, 2) = 8.19. Cabe en el saldo (7.56): si no, el trigger
            // BEFORE INSERT que rechaza el exceso respondería antes que el CHECK.
            db.Pagos.Add(new Pago
            {
                FacturaId = factura.Id, ClienteId = factura.Cliente.Id, Moneda = Moneda.Nio, MontoMoneda = 300m,
                TipoCambioAplicado = 36.6243m, Monto = 5m, MetodoPago = MetodoPago.Efectivo, UsuarioId = pago.UsuarioId,
            });
            var incoherente = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync(Ct));
            Assert.Equal("ck_pagos_moneda", Assert.IsType<PostgresException>(incoherente.InnerException).ConstraintName);
        }

        await using (var db = NuevoContexto())
        {
            // Las columnas nuevas también son inmutables (fn_pagos_proteger actualizada por la migración).
            var guardado = await db.Pagos.SingleAsync(p => p.Id == pago.Id, Ct);
            guardado.MontoMoneda = 301m;
            var modificado = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync(Ct));
            Assert.Equal(PostgresErrorCodes.RestrictViolation, Assert.IsType<PostgresException>(modificado.InnerException).SqlState);
        }
    }

    [Fact]
    public async Task TipoDeCambioSeRegistraSeCorrigeYSeAplicaElVigente()
    {
        using var admin = await ComoAsync(CodigosRol.Admin);
        using var agente = await ComoAsync(CodigosRol.Agente);

        using (var sinTipo = await agente.GetAsync("/api/exchange-rates/current", Ct))
        {
            Assert.Equal(HttpStatusCode.NotFound, sinTipo.StatusCode);
        }
        await TipoCambioAsync(admin, Hoy.AddDays(-3), 36.5000m);
        await TipoCambioAsync(admin, Hoy.AddDays(-1), 36.6000m);
        await TipoCambioAsync(admin, Hoy.AddDays(-1), 36.6243m); // corrección del mismo día
        await TipoCambioAsync(admin, Hoy.AddDays(5), 37.0000m);  // cargado por adelantado: todavía no aplica

        var vigente = await GetAsync<ExchangeRateResponse>(agente, "/api/exchange-rates/current");
        Assert.Equal(Hoy.AddDays(-1), vigente.Fecha);
        Assert.Equal(36.6243m, vigente.NioPorUsd);
        Assert.Equal(3, (await GetAsync<List<ExchangeRateResponse>>(agente, "/api/exchange-rates")).Count);

        using var deAgente = await agente.PutAsJsonAsync($"/api/exchange-rates/{Hoy:yyyy-MM-dd}", new { nioPorUsd = 36m }, Ct);
        using var cero = await admin.PutAsJsonAsync($"/api/exchange-rates/{Hoy:yyyy-MM-dd}", new { nioPorUsd = 0m }, Ct);
        using var cincoDecimales = await admin.PutAsJsonAsync($"/api/exchange-rates/{Hoy:yyyy-MM-dd}", new { nioPorUsd = 36.12345m }, Ct);
        Assert.Equal(HttpStatusCode.Forbidden, deAgente.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, cero.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, cincoDecimales.StatusCode);
    }

    [Fact]
    public async Task BuscaYFiltraFacturas()
    {
        var (pagada, _, agente) = await FacturaDeUnPaqueteAsync(1m);
        await PagarAsync(agente, pagada.Id, "USD", 3.50m, HttpStatusCode.Created);
        var (pendiente, _, _) = await FacturaDeUnPaqueteAsync(1m);

        Assert.Equal([pagada.Id], await IdsFacturas(agente, "?estadoPago=pagada"));
        Assert.Equal([pendiente.Id], await IdsFacturas(agente, "?estadoPago=PENDIENTE"));
        Assert.Equal([pendiente.Id], await IdsFacturas(agente, $"?clienteId={pendiente.Cliente.Id}"));
        Assert.Equal([pagada.Id], await IdsFacturas(agente, "?search=FAC-000001"));

        using var invalido = await agente.GetAsync("/api/invoices?estadoPago=MOROSA", Ct);
        await AssertDetalle(invalido, HttpStatusCode.BadRequest, "El estado de pago 'MOROSA' no existe.");
    }

    [Fact]
    public async Task InexistentesResponden404()
    {
        using var admin = await ComoAsync(CodigosRol.Admin);

        using var factura = await admin.GetAsync("/api/invoices/999999", Ct);
        using var pagar = await admin.PostAsJsonAsync("/api/invoices/999999/payments", new { moneda = "USD", monto = 1m, metodoPago = "EFECTIVO" }, Ct);
        using var anularFactura = await admin.PostAsJsonAsync("/api/invoices/999999/void", new { motivo = "x" }, Ct);
        using var anularPago = await admin.PostAsJsonAsync("/api/payments/999999/void", new { motivo = "x" }, Ct);

        Assert.All(new[] { factura, pagar, anularFactura, anularPago }, r => Assert.Equal(HttpStatusCode.NotFound, r.StatusCode));
    }

    [Theory]
    [InlineData(CodigosRol.Agente, "listar", HttpStatusCode.OK)]
    [InlineData(CodigosRol.Agente, "pagar", HttpStatusCode.Created)]
    [InlineData(CodigosRol.Agente, "anularFactura", HttpStatusCode.Forbidden)]
    [InlineData(CodigosRol.Agente, "anularPago", HttpStatusCode.Forbidden)]
    [InlineData(CodigosRol.Admin, "anularPago", HttpStatusCode.OK)]
    [InlineData(CodigosRol.Bodega, "listar", HttpStatusCode.Forbidden)]
    [InlineData(CodigosRol.Bodega, "pagar", HttpStatusCode.Forbidden)]
    [InlineData(CodigosRol.Bodega, "tipoCambio", HttpStatusCode.Forbidden)]
    [InlineData(CodigosRol.Repartidor, "listar", HttpStatusCode.Forbidden)]
    public async Task PermisosPorRol(string rol, string operacion, HttpStatusCode esperado)
    {
        var (factura, _, agente) = await FacturaDeUnPaqueteAsync(4.5m);
        var pago = (await PagarAsync(agente, factura.Id, "USD", 1m, HttpStatusCode.Created))!;
        using var client = await ComoAsync(rol);

        using var response = operacion switch
        {
            "listar" => await client.GetAsync("/api/invoices", Ct),
            "pagar" => await client.PostAsJsonAsync($"/api/invoices/{factura.Id}/payments", new { moneda = "USD", monto = 1m, metodoPago = "EFECTIVO" }, Ct),
            "anularFactura" => await client.PostAsJsonAsync($"/api/invoices/{factura.Id}/void", new { motivo = "x" }, Ct),
            "anularPago" => await client.PostAsJsonAsync($"/api/payments/{pago.Id}/void", new { motivo = "x" }, Ct),
            "tipoCambio" => await client.GetAsync("/api/exchange-rates", Ct),
            _ => throw new ArgumentOutOfRangeException(nameof(operacion)),
        };

        Assert.Equal(esperado, response.StatusCode);
    }

    // ---- Preparación ----

    private async Task<Cliente> ClienteAsync()
    {
        await using var db = NuevoContexto();
        return await CrearClienteAsync(db);
    }

    private static async Task<PackageResponse> RegistrarPaqueteAsync(HttpClient agente, long clienteId) =>
        (await PostAsync<PackageResponse>(agente, "/api/packages",
            new { clienteId, metodoEnvio = "AEREO", descripcion = "Audífonos" }, HttpStatusCode.Created))!;

    /// <summary>Paquete aéreo pesado (tarifa 3.50 de seed.sql). El recorrido por embarques ya lo prueba EmbarquesTests.</summary>
    private async Task<PackageResponse> PaquetePendienteDePagoAsync(long clienteId, decimal pesoLb)
    {
        using var agente = await ComoAsync(CodigosRol.Agente);
        using var bodega = await ComoAsync(CodigosRol.Bodega);
        var paquete = await RegistrarPaqueteAsync(agente, clienteId);
        await AvanzarAsync(paquete.Id, EstadoPaquete.RecibidoEnMiami, EstadoPaquete.PendienteDeEnvio,
            EstadoPaquete.EnTransito, EstadoPaquete.RecibidoEnNicaragua);
        return (await PostAsync<PackageResponse>(bodega, $"/api/packages/{paquete.Id}/weigh", new { pesoLb }, HttpStatusCode.OK))!;
    }

    private async Task<(InvoiceResponse Factura, PackageResponse Paquete, HttpClient Agente)> FacturaDeUnPaqueteAsync(decimal pesoLb)
    {
        var cliente = await ClienteAsync();
        var paquete = await PaquetePendienteDePagoAsync(cliente.Id, pesoLb);
        var agente = await ComoAsync(CodigosRol.Agente);
        var factura = (await PostAsync<InvoiceResponse>(agente, "/api/invoices",
            new { clienteId = cliente.Id, paqueteIds = new[] { paquete.Id } }, HttpStatusCode.Created))!;
        return (factura, paquete, agente);
    }

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

    private static Task<ExchangeRateResponse?> TipoCambioAsync(HttpClient admin, DateOnly fecha, decimal nioPorUsd) =>
        PutAsync<ExchangeRateResponse>(admin, $"/api/exchange-rates/{fecha:yyyy-MM-dd}", new { nioPorUsd });

    private static Task<PaymentResponse?> PagarAsync(HttpClient client, long facturaId, string moneda, decimal monto,
        HttpStatusCode esperado, string metodo = "EFECTIVO", string? referencia = null) =>
        PostAsync<PaymentResponse>(client, $"/api/invoices/{facturaId}/payments",
            new { moneda, monto, metodoPago = metodo, referencia }, esperado);

    // ---- HTTP ----

    private static async Task<T?> PostAsync<T>(HttpClient client, string ruta, object cuerpo, HttpStatusCode esperado)
    {
        using var response = await client.PostAsJsonAsync(ruta, cuerpo, JsonApi.Opciones, Ct);
        if (response.StatusCode != esperado)
        {
            Assert.Fail($"{ruta}: se esperaba {esperado} y se obtuvo {response.StatusCode}: {await response.Content.ReadAsStringAsync(Ct)}");
        }
        return await response.Content.ReadFromJsonAsync<T>(JsonApi.Opciones, Ct);
    }

    private static async Task<T?> PutAsync<T>(HttpClient client, string ruta, object cuerpo)
    {
        using var response = await client.PutAsJsonAsync(ruta, cuerpo, JsonApi.Opciones, Ct);
        if (response.StatusCode != HttpStatusCode.OK)
        {
            Assert.Fail($"{ruta}: se esperaba OK y se obtuvo {response.StatusCode}: {await response.Content.ReadAsStringAsync(Ct)}");
        }
        return await response.Content.ReadFromJsonAsync<T>(JsonApi.Opciones, Ct);
    }

    private static async Task<T> GetAsync<T>(HttpClient client, string ruta) =>
        (await client.GetFromJsonAsync<T>(ruta, JsonApi.Opciones, Ct))!;

    private static async Task<long[]> IdsFacturas(HttpClient client, string consulta) =>
        (await GetAsync<PagedResponse<InvoiceSummaryResponse>>(client, $"/api/invoices{consulta}")).Items.Select(f => f.Id).ToArray();

    private static async Task AssertProblemaAsync(HttpClient client, string ruta, object cuerpo, HttpStatusCode estado, string detalleContiene)
    {
        using var response = await client.PostAsJsonAsync(ruta, cuerpo, JsonApi.Opciones, Ct);
        await AssertDetalle(response, estado, detalleContiene);
    }

    private static async Task AssertDetalle(HttpResponseMessage response, HttpStatusCode estado, string detalleContiene)
    {
        Assert.Equal(estado, response.StatusCode);
        var problema = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        Assert.Contains(detalleContiene, problema.GetProperty("detail").GetString());
    }
}
