using Paqueteria.Api.DTOs;
using Paqueteria.Api.Entities;
using Paqueteria.Api.Services;

namespace Paqueteria.UnitTests;

public class CalculosContablesTests
{
    [Fact]
    public void AportesPrestamosYCompraDeEquipoNoSonIngresosNiGastos()
    {
        var cuentas = Cuentas();
        // Aporte 10,000; préstamo 4,000; venta 3,000; equipo 2,000; gastos 1,000; costo 700.
        var saldos = new SaldoContable[]
        {
            new(1, 0, 17000, 3200), new(2, 0, 2000, 0), new(3, 0, 0, 200),
            new(4, 0, 0, 4000), new(5, 0, 0, 300), new(6, 0, 0, 10000),
            new(7, 0, 0, 3000), new(8, 0, 700, 0), new(9, 0, 1000, 0),
        };
        var balance = CalculosContables.Balance(cuentas, saldos, new(2026, 11, 1));
        Assert.Equal("NIO", balance.Moneda);
        Assert.Equal(15600, balance.TotalActivos);
        Assert.Equal(4300, balance.TotalPasivos);
        Assert.Equal(10000, balance.CapitalYReservas);
        Assert.Equal(1300, balance.ResultadoAcumulado);
        Assert.Equal(11300, balance.TotalPatrimonio);
        Assert.Equal(0, balance.Diferencia);
        Assert.True(balance.Cuadrado);
        Assert.Equal(-200, Assert.Single(balance.Cuentas, c => c.CuentaId == 3).Saldo);

        var resultados = CalculosContables.Resultados(cuentas, saldos, new(2026, 1, 1), new(2026, 11, 1));
        Assert.Equal(3000, resultados.Ingresos);
        Assert.Equal(700, resultados.Costos);
        Assert.Equal(1000, resultados.Gastos);
        Assert.Equal(2300, resultados.UtilidadBruta);
        Assert.Equal(1300, resultados.ResultadoNeto);
        Assert.DoesNotContain(resultados.Cuentas, c => c.Tipo is TipoCuentaContable.Activo or TipoCuentaContable.Pasivo or TipoCuentaContable.Patrimonio);
    }

    [Fact]
    public void ComprobacionIncluyeSaldosInicialesYResultadosSoloMovimientosDelPeriodo()
    {
        var saldos = new SaldoContable[]
        {
            new(1, 10000, 3000, 500), new(6, -10000, 0, 0), new(7, -2000, 0, 3000),
            new(9, 2000, 500, 0),
        };
        var trial = CalculosContables.Comprobacion(Cuentas(), saldos, new(2026, 10, 1), new(2026, 10, 31));
        Assert.Equal(3500, trial.TotalDebe);
        Assert.Equal(3500, trial.TotalHaber);
        Assert.Equal(15000, trial.TotalSaldoDeudor);
        Assert.Equal(15000, trial.TotalSaldoAcreedor);
        Assert.True(trial.Cuadrado);
        Assert.Equal(10000, Assert.Single(trial.Cuentas, c => c.CuentaId == 1).SaldoInicial);
        var resultados = CalculosContables.Resultados(Cuentas(), saldos, new(2026, 10, 1), new(2026, 10, 31));
        Assert.Equal(2500, resultados.ResultadoNeto);
    }

    [Fact]
    public void UnaPerdidaReduceElPatrimonioEnLugarDeConvertirseEnActivo()
    {
        var balance = CalculosContables.Balance(Cuentas(), [new(1, 0, 0, 100), new(9, 0, 100, 0)], new(2026, 11, 1));
        Assert.Equal(-100, balance.ResultadoAcumulado);
        Assert.Equal(-100, balance.TotalPatrimonio);
        Assert.Equal(-100, balance.TotalActivos);
        Assert.True(balance.Cuadrado);
    }

    [Fact]
    public void UnContraingresoReduceLasVentasAunqueSuNaturalezaSeaDeudora()
    {
        var cuentas = Cuentas().Append(new ContabilidadCuenta
        {
            Id = 10, Codigo = "4199", Nombre = "Devoluciones", Tipo = TipoCuentaContable.Ingreso,
            Clasificacion = ClasificacionCuentaContable.NoAplica, Naturaleza = NaturalezaCuentaContable.Deudora,
        }).ToList();
        var resultados = CalculosContables.Resultados(cuentas, [new(7, 0, 0, 1000), new(10, 0, 150, 0)], new(2026, 1, 1), new(2026, 11, 1));
        Assert.Equal(850, resultados.Ingresos);
    }

    [Theory]
    [InlineData("100", "99.99")]
    [InlineData("0", "0")]
    [InlineData("1.001", "1.001")]
    [InlineData("-10", "-10")]
    public void RechazaAsientosQueNoSonPartidaDobleValida(string debe, string haber) =>
        Assert.Throws<SolicitudInvalidaException>(() => CalculosContables.ValidarPartidas(
            [new(1, decimal.Parse(debe), 0), new(2, 0, decimal.Parse(haber))]));

    [Fact]
    public void RechazaUnaPartidaConDebeYHaberSimultaneos() =>
        Assert.Throws<SolicitudInvalidaException>(() => CalculosContables.ValidarPartidas([new(1, 10, 10), new(2, 10, 10)]));

    [Fact]
    public void AceptaDecimalesExactosYAsientoConVariasContrapartidas() =>
        CalculosContables.ValidarPartidas([new(1, 10.01m, 0), new(2, 0, 5m), new(3, 0, 5.01m)]);

    [Fact]
    public void ActivosYPasivosNecesitanClasificacionCorrienteONoCorriente()
    {
        Assert.Throws<SolicitudInvalidaException>(() => CalculosContables.ValidarCuenta(
            new("1101", "Caja", TipoCuentaContable.Activo, ClasificacionCuentaContable.NoAplica, NaturalezaCuentaContable.Deudora)));
        Assert.Throws<SolicitudInvalidaException>(() => CalculosContables.ValidarCuenta(
            new("6101", "Alquiler", TipoCuentaContable.Gasto, ClasificacionCuentaContable.Corriente, NaturalezaCuentaContable.Deudora)));
    }

    private static IReadOnlyList<ContabilidadCuenta> Cuentas() =>
    [
        Cuenta(1, "1101", TipoCuentaContable.Activo), Cuenta(2, "1201", TipoCuentaContable.Activo),
        Cuenta(3, "1202", TipoCuentaContable.Activo, NaturalezaCuentaContable.Acreedora),
        Cuenta(4, "2201", TipoCuentaContable.Pasivo), Cuenta(5, "2101", TipoCuentaContable.Pasivo),
        Cuenta(6, "3101", TipoCuentaContable.Patrimonio), Cuenta(7, "4101", TipoCuentaContable.Ingreso),
        Cuenta(8, "5101", TipoCuentaContable.Costo), Cuenta(9, "6101", TipoCuentaContable.Gasto),
    ];

    private static ContabilidadCuenta Cuenta(long id, string codigo, TipoCuentaContable tipo, NaturalezaCuentaContable naturaleza = NaturalezaCuentaContable.Deudora) =>
        new() { Id = id, Codigo = codigo, Nombre = codigo, Tipo = tipo, Naturaleza = naturaleza,
            Clasificacion = tipo is TipoCuentaContable.Activo or TipoCuentaContable.Pasivo ? ClasificacionCuentaContable.Corriente : ClasificacionCuentaContable.NoAplica };
}
