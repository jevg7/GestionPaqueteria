using System.ComponentModel.DataAnnotations;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.DTOs;

public sealed record AccountingAccountRequest(
    [Required, RegularExpression(@"^[A-Za-z0-9][A-Za-z0-9.\-]{0,19}$", ErrorMessage = "El código admite letras, números, puntos y guiones (hasta 20 caracteres).")]
    string Codigo,
    [Required, MaxLength(120)] string Nombre,
    [EnumDataType(typeof(TipoCuentaContable))] TipoCuentaContable Tipo,
    [EnumDataType(typeof(ClasificacionCuentaContable))] ClasificacionCuentaContable Clasificacion,
    [EnumDataType(typeof(NaturalezaCuentaContable))] NaturalezaCuentaContable Naturaleza,
    bool Activo = true);

public sealed record AccountingAccountResponse(long Id, string Codigo, string Nombre,
    TipoCuentaContable Tipo, ClasificacionCuentaContable Clasificacion, NaturalezaCuentaContable Naturaleza, bool Activo);

public sealed record JournalLineRequest(
    [Range(1, long.MaxValue)] long CuentaId,
    [Range(typeof(decimal), "0", "9999999999999999.99")] decimal Debe,
    [Range(typeof(decimal), "0", "9999999999999999.99")] decimal Haber,
    [MaxLength(300)] string? Detalle = null);

public sealed record CreateJournalEntryRequest(
    DateOnly Fecha,
    [Required, MaxLength(500)] string Concepto,
    [MaxLength(100)] string? Referencia,
    [Required, MinLength(2), MaxLength(100)] IReadOnlyList<JournalLineRequest> Partidas);

public sealed record ReverseJournalEntryRequest(DateOnly Fecha, [Required, MaxLength(300)] string Motivo);

public sealed record CreateAccountingExpenseRequest(
    DateOnly Fecha,
    [Required, MaxLength(500)] string Concepto,
    [MaxLength(100)] string? Referencia,
    [Range(1, long.MaxValue)] long CuentaGastoId,
    [Range(1, long.MaxValue)] long ContrapartidaId,
    [Range(typeof(decimal), "0.01", "9999999999999999.99")] decimal Monto);

public sealed class JournalSearchQuery
{
    public DateOnly? Desde { get; init; }
    public DateOnly? Hasta { get; init; }
    [MaxLength(100)] public string? Search { get; init; }
    [Range(1, int.MaxValue)] public int Page { get; init; } = 1;
    [Range(1, 100)] public int PageSize { get; init; } = 20;
}

public sealed record JournalLineResponse(long CuentaId, string Codigo, string Nombre, decimal Debe, decimal Haber, string? Detalle);
public sealed record JournalEntryResponse(long Id, DateOnly Fecha, string Concepto, string? Referencia,
    long? ReversionDeId, long? RevertidoPorId, long RegistradoPorUsuarioId, DateTimeOffset CreadoEn,
    decimal TotalDebe, decimal TotalHaber, IReadOnlyList<JournalLineResponse> Partidas);

public sealed record FinancialAccountLine(long CuentaId, string Codigo, string Nombre,
    TipoCuentaContable Tipo, ClasificacionCuentaContable Clasificacion, decimal Saldo);

public sealed record BalanceSheetResponse(string Moneda, DateOnly FechaCorte, IReadOnlyList<FinancialAccountLine> Cuentas,
    decimal TotalActivos, decimal TotalPasivos, decimal CapitalYReservas, decimal ResultadoAcumulado,
    decimal TotalPatrimonio, decimal Diferencia, bool Cuadrado);

public sealed record IncomeStatementResponse(string Moneda, DateOnly Desde, DateOnly Hasta, IReadOnlyList<FinancialAccountLine> Cuentas,
    decimal Ingresos, decimal Costos, decimal Gastos, decimal UtilidadBruta, decimal ResultadoNeto);

public sealed record TrialBalanceLine(long CuentaId, string Codigo, string Nombre, TipoCuentaContable Tipo,
    ClasificacionCuentaContable Clasificacion, decimal SaldoInicial, decimal Debe, decimal Haber,
    decimal SaldoDeudor, decimal SaldoAcreedor);

public sealed record TrialBalanceResponse(string Moneda, DateOnly Desde, DateOnly Hasta, IReadOnlyList<TrialBalanceLine> Cuentas,
    decimal TotalDebe, decimal TotalHaber, decimal TotalSaldoDeudor, decimal TotalSaldoAcreedor, bool Cuadrado);
