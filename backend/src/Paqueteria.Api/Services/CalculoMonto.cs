namespace Paqueteria.Api.Services;

/// <summary>
/// Montos y fechas del negocio. Tarifas y tipos de cambio salen de la BD, nunca del código.
/// Todo redondeo es a 2 decimales con los medios hacia arriba, igual que round() de PostgreSQL
/// (los CHECK de detalles_factura y pagos lo exigen).
/// </summary>
public static class CalculoMonto
{
    private static readonly TimeZoneInfo Managua = TimeZoneInfo.FindSystemTimeZoneById("America/Managua");

    /// <summary>
    /// round(peso × tarifa, 2). El peso se usa tal cual, sin redondear a la libra (pregunta abierta 3
    /// con la agencia: si cambia, se ajusta aquí). Sin impuestos: la tarifa ya incluye el IVA.
    /// </summary>
    public static decimal Calcular(decimal pesoLb, decimal precioPorLibra) => Redondear(pesoLb * precioPorLibra);

    /// <summary>
    /// Dólares abonados por un pago en córdobas: round(córdobas ÷ tipo de cambio, 2). Es la misma
    /// fórmula que exige ck_pagos_moneda.
    /// </summary>
    public static decimal ADolares(decimal cordobas, decimal nioPorUsd) => Redondear(cordobas / nioPorUsd);

    /// <summary>
    /// Córdobas equivalentes a un monto en dólares: round(dólares × tipo de cambio, 2). Pagar
    /// ACordobas(saldo) abona exactamente el saldo: ADolares(ACordobas(s)) == s.
    /// </summary>
    public static decimal ACordobas(decimal dolares, decimal nioPorUsd) => Redondear(dolares * nioPorUsd);

    /// <summary>
    /// Día del negocio en Managua (UTC-6). Se usa para la tarifa del pesaje y el tipo de cambio del
    /// pago: la BD está en UTC y después de las 18:00 en Managua ya es el día siguiente en UTC.
    /// </summary>
    public static DateOnly FechaEnManagua(DateTimeOffset ahora) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(ahora, Managua).DateTime);

    private static decimal Redondear(decimal valor) => Math.Round(valor, 2, MidpointRounding.AwayFromZero);
}
