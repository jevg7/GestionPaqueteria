using Microsoft.EntityFrameworkCore;
using Paqueteria.Api.Auth;
using Paqueteria.Api.Data;
using Paqueteria.Api.DTOs;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.Services;

/// <summary>
/// Tipo de cambio diario (córdobas por dólar), registrado por el administrador. El vigente es el más
/// reciente con fecha ≤ hoy en Managua: si un día no se registra (fin de semana), se usa el último.
/// </summary>
public sealed class TiposCambioService(
    PaqueteriaDbContext db,
    UsuarioActual usuarioActual,
    TimeProvider reloj,
    ILogger<TiposCambioService> logger)
{
    public Task<TipoCambio?> VigenteAsync(CancellationToken cancellationToken)
    {
        var hoy = CalculoMonto.FechaEnManagua(reloj.GetUtcNow());
        return db.TiposCambio.AsNoTracking()
            .Where(t => t.Fecha <= hoy)
            .OrderByDescending(t => t.Fecha)
            .FirstOrDefaultAsync(cancellationToken);
    }

    /// <summary>Los últimos registrados, del más reciente al más antiguo (incluye fechas futuras ya cargadas).</summary>
    public async Task<IReadOnlyList<ExchangeRateResponse>> ListarAsync(CancellationToken cancellationToken) =>
        await db.TiposCambio.AsNoTracking()
            .OrderByDescending(t => t.Fecha)
            .Take(60)
            .Select(t => new ExchangeRateResponse(t.Fecha, t.NioPorUsd, t.CreadoPorUsuarioId, t.ActualizadoEn))
            .ToListAsync(cancellationToken);

    /// <summary>
    /// Registra o corrige el tipo de cambio de un día (puede ser futuro: el BCN publica la tabla del
    /// mes por adelantado). Corregirlo no cambia los pagos ya registrados: cada pago guarda su copia.
    /// </summary>
    public async Task<ExchangeRateResponse> RegistrarAsync(DateOnly fecha, decimal nioPorUsd, CancellationToken cancellationToken)
    {
        var tipoCambio = await db.TiposCambio.SingleOrDefaultAsync(t => t.Fecha == fecha, cancellationToken);
        var anterior = tipoCambio?.NioPorUsd;
        if (tipoCambio is null)
        {
            tipoCambio = new TipoCambio { Fecha = fecha, CreadoPorUsuarioId = usuarioActual.Id };
            db.TiposCambio.Add(tipoCambio);
        }
        tipoCambio.NioPorUsd = nioPorUsd;
        await db.SaveChangesAsync(cancellationToken);

        logger.LogInformation("Tipo de cambio del {Fecha:yyyy-MM-dd}: {Anterior} -> {Valor} NIO/USD, por el usuario {UsuarioId}.",
            fecha, anterior, nioPorUsd, usuarioActual.Id);
        return new ExchangeRateResponse(tipoCambio.Fecha, tipoCambio.NioPorUsd, tipoCambio.CreadoPorUsuarioId, tipoCambio.ActualizadoEn);
    }
}
