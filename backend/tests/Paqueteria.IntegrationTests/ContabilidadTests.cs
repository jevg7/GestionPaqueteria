using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Paqueteria.Api.Auth;
using Paqueteria.Api.DTOs;
using Paqueteria.Api.Entities;
using Paqueteria.Api.Services;
using Paqueteria.IntegrationTests.Infrastructure;

namespace Paqueteria.IntegrationTests;

/// <summary>Libros NIO con PostgreSQL real aislado: partida doble, reportes, reversión y RLS.</summary>
public class ContabilidadTests(ServidorPostgres servidor) : PruebaHttpConBaseDeDatos(servidor)
{
    private static DateOnly Hoy => CalculoMonto.FechaEnManagua(DateTimeOffset.UtcNow);

    [Fact]
    public async Task DiarioYGastosProducenEstadosSinConfundirCapitalNiEquipoConResultados()
    {
        using var admin = await ComoAsync(CodigosRol.Admin);
        var cuentas = await Inicializar(admin);
        var otraInicializacion = await Inicializar(admin);
        Assert.Equal(cuentas.Select(c => c.Id), otraInicializacion.Select(c => c.Id));
        long Id(string codigo) => cuentas.Single(c => c.Codigo == codigo).Id;
        await Crear(admin, new(Hoy, "Aporte inicial", "AP-1", [new(Id("1101"), 10000, 0), new(Id("3101"), 0, 10000)]));
        await Crear(admin, new(Hoy, "Ingresos de envíos", null, [new(Id("1101"), 3000, 0), new(Id("4101"), 0, 3000)]));
        await Crear(admin, new(Hoy, "Compra de equipo", null, [new(Id("1201"), 2000, 0), new(Id("1101"), 0, 2000)]));
        await Crear(admin, new(Hoy, "Depreciación", null, [new(Id("6106"), 200, 0), new(Id("1202"), 0, 200)]));
        using (var gasto = await admin.PostAsJsonAsync("/api/accounting/expenses",
            new CreateAccountingExpenseRequest(Hoy, "Alquiler", "REC-1", Id("6101"), Id("1101"), 1200), JsonApi.Opciones, Ct))
            Assert.Equal(HttpStatusCode.Created, gasto.StatusCode);
        using (var pendiente = await admin.PostAsJsonAsync("/api/accounting/expenses",
            new CreateAccountingExpenseRequest(Hoy, "Servicios pendientes", null, Id("6102"), Id("2101"), 500), JsonApi.Opciones, Ct))
            Assert.Equal(HttpStatusCode.Created, pendiente.StatusCode);

        var balance = await admin.GetFromJsonAsync<BalanceSheetResponse>($"/api/accounting/balance-sheet?asOf={Hoy:yyyy-MM-dd}", JsonApi.Opciones, Ct);
        Assert.NotNull(balance);
        Assert.Equal((11600m, 500m, 11100m, 1100m),
            (balance.TotalActivos, balance.TotalPasivos, balance.TotalPatrimonio, balance.ResultadoAcumulado));
        Assert.True(balance.Cuadrado);
        Assert.Equal(-200, Assert.Single(balance.Cuentas, c => c.Codigo == "1202").Saldo);
        var resultados = await admin.GetFromJsonAsync<IncomeStatementResponse>(
            $"/api/accounting/income-statement?from={Hoy:yyyy-MM-dd}&to={Hoy:yyyy-MM-dd}", JsonApi.Opciones, Ct);
        Assert.Equal((3000m, 1900m, 1100m), (resultados!.Ingresos, resultados.Gastos, resultados.ResultadoNeto));
        var comprobacion = await admin.GetFromJsonAsync<TrialBalanceResponse>(
            $"/api/accounting/trial-balance?from={Hoy:yyyy-MM-dd}&to={Hoy:yyyy-MM-dd}", JsonApi.Opciones, Ct);
        Assert.True(comprobacion!.Cuadrado);
        Assert.Equal(comprobacion.TotalDebe, comprobacion.TotalHaber);
        Assert.Equal(comprobacion.TotalSaldoDeudor, comprobacion.TotalSaldoAcreedor);
    }

    [Fact]
    public async Task AsientoDescuadradoOSubcentimoNoDejaCabeceraNiPartidas()
    {
        using var admin = await ComoAsync(CodigosRol.Admin);
        var cuentas = await Inicializar(admin);
        foreach (var importe in new[] { 99.99m, 100.001m })
        {
            using var response = await admin.PostAsJsonAsync("/api/accounting/journal",
                new CreateJournalEntryRequest(Hoy, "Inválido", null,
                    [new(cuentas[0].Id, 100, 0), new(cuentas[1].Id, 0, importe)]), JsonApi.Opciones, Ct);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }
        await using var db = NuevoContexto();
        Assert.Equal(0, await db.Set<ContabilidadAsiento>().CountAsync(Ct));
        Assert.Equal(0, await db.Set<ContabilidadPartida>().CountAsync(Ct));
    }

    [Fact]
    public async Task ReversionPosteriorNoBorraElGastoHistoricoYPermiteSuCuentaDesactivada()
    {
        using var admin = await ComoAsync(CodigosRol.Admin);
        var cuentas = await Inicializar(admin);
        var gasto = cuentas.Single(c => c.Codigo == "6101");
        var caja = cuentas.Single(c => c.Codigo == "1101");
        var original = await Crear(admin, new(Hoy.AddDays(-2), "Gasto a corregir", null,
            [new(gasto.Id, 100, 0), new(caja.Id, 0, 100)]));
        using (var desactivar = await admin.PutAsJsonAsync($"/api/accounting/accounts/{gasto.Id}",
            new AccountingAccountRequest(gasto.Codigo, gasto.Nombre, gasto.Tipo, gasto.Clasificacion, gasto.Naturaleza, false), JsonApi.Opciones, Ct))
            Assert.Equal(HttpStatusCode.OK, desactivar.StatusCode);
        using var response = await admin.PostAsJsonAsync($"/api/accounting/journal/{original.Id}/reverse",
            new ReverseJournalEntryRequest(Hoy.AddDays(-1), "Registro duplicado"), JsonApi.Opciones, Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var reversa = await response.Content.ReadFromJsonAsync<JournalEntryResponse>(JsonApi.Opciones, Ct);
        Assert.Equal(original.Id, reversa!.ReversionDeId);
        using var segunda = await admin.PostAsJsonAsync($"/api/accounting/journal/{original.Id}/reverse",
            new ReverseJournalEntryRequest(Hoy, "Otra vez"), JsonApi.Opciones, Ct);
        Assert.Equal(HttpStatusCode.Conflict, segunda.StatusCode);
        var antes = await admin.GetFromJsonAsync<BalanceSheetResponse>(
            $"/api/accounting/balance-sheet?asOf={original.Fecha:yyyy-MM-dd}", JsonApi.Opciones, Ct);
        var despues = await admin.GetFromJsonAsync<BalanceSheetResponse>(
            $"/api/accounting/balance-sheet?asOf={Hoy:yyyy-MM-dd}", JsonApi.Opciones, Ct);
        Assert.Equal(-100, antes!.ResultadoAcumulado);
        Assert.Equal(0, despues!.ResultadoAcumulado);
        var detalle = await admin.GetFromJsonAsync<JournalEntryResponse>($"/api/accounting/journal/{original.Id}", JsonApi.Opciones, Ct);
        Assert.Equal(reversa.Id, detalle!.RevertidoPorId);
    }

    [Fact]
    public async Task CuentaConMovimientosNoSeReclasificaYDiarioNoAdmiteAgregarPartidasDespues()
    {
        using var admin = await ComoAsync(CodigosRol.Admin);
        var cuentas = await Inicializar(admin);
        var caja = cuentas.Single(c => c.Codigo == "1101");
        var capital = cuentas.Single(c => c.Codigo == "3101");
        var asiento = await Crear(admin, new(Hoy, "Apertura", null, [new(caja.Id, 100, 0), new(capital.Id, 0, 100)]));
        using var cambiar = await admin.PutAsJsonAsync($"/api/accounting/accounts/{caja.Id}",
            new AccountingAccountRequest(caja.Codigo, caja.Nombre, TipoCuentaContable.Gasto,
                ClasificacionCuentaContable.NoAplica, caja.Naturaleza), JsonApi.Opciones, Ct);
        Assert.Equal(HttpStatusCode.Conflict, cambiar.StatusCode);
        await using var dueno = BaseDeDatos.CrearContextoDueno();
        var agregar = await Assert.ThrowsAsync<PostgresException>(() => dueno.Database.ExecuteSqlInterpolatedAsync($"""
            insert into paqueteria.partidas_contables (agencia_id, asiento_id, cuenta_id, debe, haber)
            values ({BaseDeDatosDePrueba.AgenciaDeEjemplo}, {asiento.Id}, {caja.Id}, 10, 0),
                   ({BaseDeDatosDePrueba.AgenciaDeEjemplo}, {asiento.Id}, {capital.Id}, 0, 10)
            """, Ct));
        Assert.Equal(PostgresErrorCodes.RestrictViolation, agregar.SqlState);
        var editar = await Assert.ThrowsAsync<PostgresException>(() => dueno.Database.ExecuteSqlInterpolatedAsync(
            $"update paqueteria.asientos_contables set concepto = 'Alterado' where id = {asiento.Id}", Ct));
        Assert.Equal(PostgresErrorCodes.RestrictViolation, editar.SqlState);
    }

    [Fact]
    public async Task ContabilidadExigeAdminYAislaCuentasYDiariosEntreAgencias()
    {
        using var agente = await ComoAsync(CodigosRol.Agente);
        using (var prohibida = await agente.GetAsync("/api/accounting/accounts", Ct))
            Assert.Equal(HttpStatusCode.Forbidden, prohibida.StatusCode);
        using var admin = await ComoAsync(CodigosRol.Admin);
        var cuentas = await Inicializar(admin);
        var otraAgencia = await CrearAgenciaAsync("Otra contabilidad");
        using var otro = await ComoEnAgenciaAsync(otraAgencia, CodigosRol.Admin);
        var propias = await otro.GetFromJsonAsync<List<AccountingAccountResponse>>("/api/accounting/accounts", JsonApi.Opciones, Ct);
        Assert.Empty(propias!);
        using var cruzada = await otro.PostAsJsonAsync("/api/accounting/journal",
            new CreateJournalEntryRequest(Hoy, "Cruce inválido", null,
                [new(cuentas[0].Id, 100, 0), new(cuentas[1].Id, 0, 100)]), JsonApi.Opciones, Ct);
        Assert.Equal(HttpStatusCode.BadRequest, cruzada.StatusCode);
        var diario = await otro.GetFromJsonAsync<PagedResponse<JournalEntryResponse>>("/api/accounting/journal", JsonApi.Opciones, Ct);
        Assert.Equal(0, diario!.Total);
    }

    private static async Task<IReadOnlyList<AccountingAccountResponse>> Inicializar(HttpClient cliente)
    {
        using var response = await cliente.PostAsync("/api/accounting/accounts/initialize", null, Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<List<AccountingAccountResponse>>(JsonApi.Opciones, Ct))!;
    }

    private static async Task<JournalEntryResponse> Crear(HttpClient cliente, CreateJournalEntryRequest datos)
    {
        using var response = await cliente.PostAsJsonAsync("/api/accounting/journal", datos, JsonApi.Opciones, Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<JournalEntryResponse>(JsonApi.Opciones, Ct))!;
    }
}
