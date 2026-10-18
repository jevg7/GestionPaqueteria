using Microsoft.EntityFrameworkCore;
using Paqueteria.Api.Auth;
using Paqueteria.Api.Data;
using Paqueteria.Api.DTOs;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.Services;

/// <summary>
/// Tarifas por método de envío, administradas por el ADMIN. Una tarifa nueva rige desde hoy (hora de
/// Managua) en adelante y cierra la anterior el día previo; la BD impide vigencias traslapadas. Los
/// paquetes ya pesados no cambian: guardan una copia del precio. No hay edición: se anula y se
/// registra otra. Solo se anula una tarifa programada, o una vigente que aún no se aplicó a paquetes;
/// al anularla, la anterior vuelve a cubrir sus fechas.
/// Bloqueo: las tarifas activas del método, por fecha de inicio (igual al crear y al anular).
/// </summary>
public sealed class TarifasService(
    PaqueteriaDbContext db, UsuarioActual usuarioActual, TimeProvider reloj, ILogger<TarifasService> logger)
{
    public async Task<IReadOnlyList<RateResponse>> ListarAsync(RateSearchQuery filtro, CancellationToken cancellationToken)
    {
        var consulta = db.TarifasEnvio.AsNoTracking().Include(t => t.MetodoEnvio).AsQueryable();
        if (!filtro.IncluirAnuladas)
        {
            consulta = consulta.Where(t => t.Activo);
        }
        if (!string.IsNullOrWhiteSpace(filtro.MetodoEnvio))
        {
            var metodo = filtro.MetodoEnvio.Trim().ToUpperInvariant();
            consulta = consulta.Where(t => t.MetodoEnvio.Codigo == metodo);
        }

        var tarifas = await consulta
            .OrderBy(t => t.MetodoEnvioId).ThenByDescending(t => t.FechaInicio).ThenByDescending(t => t.Id)
            .ToListAsync(cancellationToken);
        var hoy = Hoy();
        return tarifas.Select(t => AResponse(t, hoy)).ToList();
    }

    public async Task<RateResponse?> ObtenerAsync(int id, CancellationToken cancellationToken)
    {
        var tarifa = await db.TarifasEnvio.AsNoTracking().Include(t => t.MetodoEnvio)
            .SingleOrDefaultAsync(t => t.Id == id, cancellationToken);
        return tarifa is null ? null : AResponse(tarifa, Hoy());
    }

    /// <summary>La tarifa de hoy de cada método activo (la misma que usará el pesaje).</summary>
    public async Task<IReadOnlyList<CurrentRateResponse>> VigentesAsync(CancellationToken cancellationToken)
    {
        var hoy = Hoy();
        var metodos = await db.MetodosEnvio.AsNoTracking().Where(m => m.Activo).OrderBy(m => m.Id).ToListAsync(cancellationToken);
        var resultado = new List<CurrentRateResponse>();
        foreach (var metodo in metodos)
        {
            // fn_tarifa_vigente devuelve una fila con todo NULL si no hay tarifa: se descarta con "id is not null".
            var tarifa = await db.TarifasEnvio
                .FromSql($"select t.* from paqueteria.fn_tarifa_vigente({metodo.Id}, {hoy}) as t where t.id is not null")
                .AsNoTracking()
                .SingleOrDefaultAsync(cancellationToken);
            if (tarifa is not null)
            {
                tarifa.MetodoEnvio = metodo;
            }
            resultado.Add(new CurrentRateResponse(Ref(metodo), tarifa is null ? null : AResponse(tarifa, hoy)));
        }
        return resultado;
    }

    public async Task<RateResponse> CrearAsync(CreateRateRequest datos, CancellationToken cancellationToken)
    {
        var hoy = Hoy();
        var inicio = datos.FechaInicio ?? hoy;
        if (inicio < hoy)
        {
            throw new SolicitudInvalidaException(
                $"Una tarifa rige desde hoy en adelante: la fecha de inicio no puede ser anterior al {hoy:yyyy-MM-dd}.");
        }
        var codigo = datos.MetodoEnvio.Trim().ToUpperInvariant();
        var metodo = await db.MetodosEnvio.SingleOrDefaultAsync(m => m.Codigo == codigo, cancellationToken)
            ?? throw new SolicitudInvalidaException($"El método de envío '{datos.MetodoEnvio.Trim()}' no existe.");

        await using var transaccion = await db.Database.BeginTransactionAsync(cancellationToken);
        var activas = await BloquearActivasAsync(metodo.Id, cancellationToken);
        if (activas.FirstOrDefault(t => t.FechaInicio >= inicio) is { } posterior)
        {
            throw new ConflictoException(
                $"Ya hay una tarifa {metodo.Codigo} desde el {posterior.FechaInicio:yyyy-MM-dd}. Anúlela antes de registrar otra.");
        }

        // La que cubre la fecha de inicio (a lo sumo una) termina el día anterior. Se guarda antes de
        // insertar la nueva: la exclusión de traslapes no es diferible.
        var anterior = activas.SingleOrDefault(t => t.FechaFin is null || t.FechaFin >= inicio);
        if (anterior is not null)
        {
            anterior.FechaFin = inicio.AddDays(-1);
            await db.SaveChangesAsync(cancellationToken);
        }

        var tarifa = new TarifaEnvio
        {
            MetodoEnvioId = metodo.Id,
            PrecioPorUnidad = datos.PrecioPorUnidad,
            FechaInicio = inicio,
            CreadoPorUsuarioId = usuarioActual.Id,
        };
        db.TarifasEnvio.Add(tarifa);
        await db.SaveChangesAsync(cancellationToken);
        await transaccion.CommitAsync(cancellationToken);

        logger.LogInformation(
            "Tarifa {TarifaId} ({Metodo}, {Precio} USD/lb desde {Inicio:yyyy-MM-dd}) registrada por el usuario {UsuarioId}; tarifa anterior cerrada: {AnteriorId}.",
            tarifa.Id, metodo.Codigo, tarifa.PrecioPorUnidad, inicio, usuarioActual.Id, anterior?.Id);
        tarifa.MetodoEnvio = metodo;
        return AResponse(tarifa, hoy);
    }

    /// <summary>Anula la tarifa y devuelve sus fechas a la anterior. False si no existe.</summary>
    public async Task<bool> AnularAsync(int id, CancellationToken cancellationToken)
    {
        var metodoId = await db.TarifasEnvio.Where(t => t.Id == id).Select(t => (short?)t.MetodoEnvioId).SingleOrDefaultAsync(cancellationToken);
        if (metodoId is null)
        {
            return false;
        }

        await using var transaccion = await db.Database.BeginTransactionAsync(cancellationToken);
        var activas = await BloquearActivasAsync(metodoId.Value, cancellationToken);
        var tarifa = activas.SingleOrDefault(t => t.Id == id)
            ?? throw new ConflictoException("La tarifa ya está anulada.");
        var hoy = Hoy();
        if (tarifa.FechaFin < hoy)
        {
            throw new ConflictoException("La tarifa ya venció: las tarifas vencidas no se anulan.");
        }
        if (tarifa.FechaInicio <= hoy && await db.Paquetes.AnyAsync(p => p.TarifaId == id, cancellationToken))
        {
            throw new ConflictoException("La tarifa ya se aplicó a paquetes. Para cambiar el precio registre una tarifa nueva.");
        }

        tarifa.Activo = false;
        await db.SaveChangesAsync(cancellationToken);
        var anterior = activas.SingleOrDefault(t => t.Activo && t.FechaFin == tarifa.FechaInicio.AddDays(-1));
        if (anterior is not null)
        {
            anterior.FechaFin = tarifa.FechaFin;
            await db.SaveChangesAsync(cancellationToken);
        }
        await transaccion.CommitAsync(cancellationToken);

        logger.LogInformation("Tarifa {TarifaId} anulada por el usuario {UsuarioId}; tarifa reabierta: {AnteriorId}.",
            tarifa.Id, usuarioActual.Id, anterior?.Id);
        return true;
    }

    /// <summary>SELECT … FOR UPDATE de las tarifas activas del método. Requiere una transacción abierta.</summary>
    private Task<List<TarifaEnvio>> BloquearActivasAsync(short metodoId, CancellationToken cancellationToken) =>
        db.TarifasEnvio
            .FromSql($"select * from paqueteria.tarifas_envio where metodo_envio_id = {metodoId} and activo order by fecha_inicio, id for update")
            .ToListAsync(cancellationToken);

    private DateOnly Hoy() => CalculoMonto.FechaEnManagua(reloj.GetUtcNow());

    private static RateResponse AResponse(TarifaEnvio t, DateOnly hoy) => new(
        t.Id, Ref(t.MetodoEnvio), t.PrecioPorUnidad, t.Unidad, t.Moneda, t.FechaInicio, t.FechaFin,
        !t.Activo ? EstadoTarifa.Anulada
            : t.FechaInicio > hoy ? EstadoTarifa.Programada
            : t.FechaFin < hoy ? EstadoTarifa.Vencida
            : EstadoTarifa.Vigente,
        t.CreadoPorUsuarioId, t.CreadoEn);

    private static ShippingMethodRef Ref(MetodoEnvio m) => new(m.Codigo, m.Nombre);
}
