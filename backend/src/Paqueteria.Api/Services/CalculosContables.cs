using Paqueteria.Api.DTOs;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.Services;

/// <summary>Sumas de un mayor: saldo inicial deudor positivo y movimientos del período.</summary>
public sealed record SaldoContable(long CuentaId, decimal SaldoInicial, decimal Debe, decimal Haber)
{
    public decimal SaldoFinal => SaldoInicial + Debe - Haber;
}

/// <summary>Partida doble y estados en córdobas. La naturaleza de una contra-cuenta no invierte su grupo.</summary>
public static class CalculosContables
{
    public const string MonedaFuncional = "NIO";
    public const decimal ImporteMaximo = 9999999999999999.99m;

    public static void ValidarPartidas(IReadOnlyList<JournalLineRequest> partidas)
    {
        if (partidas is null || partidas.Count is < 2 or > 100)
            throw new SolicitudInvalidaException("Un asiento necesita entre 2 y 100 partidas.");
        foreach (var partida in partidas)
        {
            if (partida is null || partida.CuentaId <= 0 || partida.Debe < 0 || partida.Haber < 0 ||
                partida.Debe > ImporteMaximo || partida.Haber > ImporteMaximo ||
                decimal.Round(partida.Debe, 2) != partida.Debe || decimal.Round(partida.Haber, 2) != partida.Haber ||
                (partida.Debe > 0) == (partida.Haber > 0))
                throw new SolicitudInvalidaException("Cada partida debe tener un importe positivo en debe o haber, con hasta dos decimales.");
        }
        if (partidas.Sum(p => p.Debe) != partidas.Sum(p => p.Haber))
            throw new SolicitudInvalidaException("El asiento no cuadra: el total del debe debe ser igual al total del haber.");
    }

    public static void ValidarCuenta(AccountingAccountRequest datos)
    {
        if (!Enum.IsDefined(datos.Tipo) || !Enum.IsDefined(datos.Clasificacion) || !Enum.IsDefined(datos.Naturaleza))
            throw new SolicitudInvalidaException("El tipo, la clasificación o la naturaleza de la cuenta no son válidos.");
        var deBalance = datos.Tipo is TipoCuentaContable.Activo or TipoCuentaContable.Pasivo;
        if (deBalance == (datos.Clasificacion == ClasificacionCuentaContable.NoAplica))
            throw new SolicitudInvalidaException("Los activos y pasivos deben clasificarse como corrientes o no corrientes; las demás cuentas usan No aplica.");
    }

    public static BalanceSheetResponse Balance(IReadOnlyList<ContabilidadCuenta> cuentas, IReadOnlyList<SaldoContable> saldos, DateOnly fecha)
    {
        var lineas = Lineas(cuentas, saldos, incluirInicial: true);
        decimal Total(TipoCuentaContable tipo) => lineas.Where(c => c.Tipo == tipo).Sum(c => c.Saldo);
        var activos = Total(TipoCuentaContable.Activo);
        var pasivos = Total(TipoCuentaContable.Pasivo);
        var capital = Total(TipoCuentaContable.Patrimonio);
        var resultado = Total(TipoCuentaContable.Ingreso) - Total(TipoCuentaContable.Costo) - Total(TipoCuentaContable.Gasto);
        var patrimonio = capital + resultado;
        var diferencia = activos - pasivos - patrimonio;
        return new(MonedaFuncional, fecha,
            lineas.Where(c => c.Tipo is TipoCuentaContable.Activo or TipoCuentaContable.Pasivo or TipoCuentaContable.Patrimonio).ToList(),
            activos, pasivos, capital, resultado, patrimonio, diferencia, diferencia == 0);
    }

    public static IncomeStatementResponse Resultados(IReadOnlyList<ContabilidadCuenta> cuentas, IReadOnlyList<SaldoContable> saldos, DateOnly desde, DateOnly hasta)
    {
        var lineas = Lineas(cuentas, saldos, incluirInicial: false)
            .Where(c => c.Tipo is TipoCuentaContable.Ingreso or TipoCuentaContable.Costo or TipoCuentaContable.Gasto).ToList();
        var ingresos = lineas.Where(c => c.Tipo == TipoCuentaContable.Ingreso).Sum(c => c.Saldo);
        var costos = lineas.Where(c => c.Tipo == TipoCuentaContable.Costo).Sum(c => c.Saldo);
        var gastos = lineas.Where(c => c.Tipo == TipoCuentaContable.Gasto).Sum(c => c.Saldo);
        return new(MonedaFuncional, desde, hasta, lineas, ingresos, costos, gastos, ingresos - costos, ingresos - costos - gastos);
    }

    public static TrialBalanceResponse Comprobacion(IReadOnlyList<ContabilidadCuenta> cuentas, IReadOnlyList<SaldoContable> saldos, DateOnly desde, DateOnly hasta)
    {
        var porCuenta = saldos.ToDictionary(s => s.CuentaId);
        var lineas = cuentas.OrderBy(c => c.Codigo, StringComparer.Ordinal)
            .Where(c => porCuenta.ContainsKey(c.Id)).Select(c =>
            {
                var saldo = porCuenta[c.Id];
                return new TrialBalanceLine(c.Id, c.Codigo, c.Nombre, c.Tipo, c.Clasificacion,
                    saldo.SaldoInicial, saldo.Debe, saldo.Haber, Math.Max(saldo.SaldoFinal, 0), Math.Max(-saldo.SaldoFinal, 0));
            }).ToList();
        var debe = lineas.Sum(c => c.Debe);
        var haber = lineas.Sum(c => c.Haber);
        var saldoDeudor = lineas.Sum(c => c.SaldoDeudor);
        var saldoAcreedor = lineas.Sum(c => c.SaldoAcreedor);
        return new(MonedaFuncional, desde, hasta, lineas, debe, haber, saldoDeudor, saldoAcreedor,
            debe == haber && saldoDeudor == saldoAcreedor);
    }

    private static IReadOnlyList<FinancialAccountLine> Lineas(IReadOnlyList<ContabilidadCuenta> cuentas, IReadOnlyList<SaldoContable> saldos, bool incluirInicial)
    {
        var porCuenta = saldos.ToDictionary(s => s.CuentaId);
        return cuentas.OrderBy(c => c.Codigo, StringComparer.Ordinal).Where(c => porCuenta.ContainsKey(c.Id)).Select(c =>
        {
            var movimientos = porCuenta[c.Id];
            var deudor = movimientos.Debe - movimientos.Haber + (incluirInicial ? movimientos.SaldoInicial : 0);
            var saldo = c.Tipo is TipoCuentaContable.Activo or TipoCuentaContable.Costo or TipoCuentaContable.Gasto ? deudor : -deudor;
            return new FinancialAccountLine(c.Id, c.Codigo, c.Nombre, c.Tipo, c.Clasificacion, saldo);
        }).Where(c => c.Saldo != 0).ToList();
    }
}
