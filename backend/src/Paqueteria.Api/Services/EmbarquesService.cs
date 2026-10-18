using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Paqueteria.Api.Auth;
using Paqueteria.Api.Data;
using Paqueteria.Api.DTOs;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.Services;

/// <summary>
/// Embarques: ABIERTO (recibe paquetes) → CERRADO → EN_TRANSITO → RECIBIDO; CANCELADO solo sin
/// paquetes. La salida y la llegada mueven el estado de todos sus paquetes en la misma transacción.
/// </summary>
/// <remarks>
/// Orden de bloqueo fijo para evitar bloqueos mutuos: primero el embarque, después sus paquetes en
/// orden de id. Las transiciones de paquetes pasan por <see cref="PaquetesService.TransicionarAsync"/>.
/// </remarks>
public sealed class EmbarquesService(
    PaqueteriaDbContext db,
    PaquetesService paquetes,
    UsuarioActual usuarioActual,
    TimeProvider reloj,
    ILogger<EmbarquesService> logger)
{
    private static readonly Expression<Func<Embarque, ShipmentResponse>> AResponse = e => new ShipmentResponse(
        e.Id,
        e.CodigoEmbarque,
        new ShippingMethodRef(e.MetodoEnvio.Codigo, e.MetodoEnvio.Nombre),
        new RouteRef(e.Ruta.Id, e.Ruta.Nombre, e.Ruta.Origen.Codigo, e.Ruta.Destino.Codigo),
        e.Estado,
        e.FechaSalida,
        e.FechaLlegadaEstimada,
        e.FechaLlegadaReal,
        e.Observaciones,
        e.Paquetes.Count,
        e.CreadoEn,
        e.ActualizadoEn);

    public async Task<PagedResponse<ShipmentResponse>> BuscarAsync(ShipmentSearchQuery filtro, CancellationToken cancellationToken)
    {
        var consulta = db.Embarques.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(filtro.Estado))
        {
            var estado = UpperSnakeEnum<EstadoEmbarque>.DesdeTextoDeUsuario(filtro.Estado)
                ?? throw new SolicitudInvalidaException($"El estado de embarque '{filtro.Estado}' no existe.");
            consulta = consulta.Where(e => e.Estado == estado);
        }
        if (!string.IsNullOrWhiteSpace(filtro.MetodoEnvio))
        {
            var metodo = filtro.MetodoEnvio.Trim().ToUpperInvariant();
            consulta = consulta.Where(e => e.MetodoEnvio.Codigo == metodo);
        }
        var termino = filtro.Search?.Trim();
        if (!string.IsNullOrEmpty(termino))
        {
            var patron = Busqueda.PatronContiene(termino);
            consulta = consulta.Where(e => EF.Functions.ILike(e.CodigoEmbarque, patron, Busqueda.Escape));
        }

        var total = await consulta.CountAsync(cancellationToken);
        var items = await consulta
            .OrderByDescending(e => e.CreadoEn).ThenByDescending(e => e.Id)
            .Skip((filtro.Page - 1) * filtro.PageSize)
            .Take(filtro.PageSize)
            .Select(AResponse)
            .ToListAsync(cancellationToken);

        return new PagedResponse<ShipmentResponse>(items, filtro.Page, filtro.PageSize, total);
    }

    public Task<ShipmentResponse?> ObtenerAsync(long id, CancellationToken cancellationToken) =>
        db.Embarques.AsNoTracking().Where(e => e.Id == id).Select(AResponse).SingleOrDefaultAsync(cancellationToken);

    /// <summary>Paquetes del embarque. Null si el embarque no existe.</summary>
    public async Task<IReadOnlyList<PackageResponse>?> PaquetesAsync(long id, CancellationToken cancellationToken) =>
        await db.Embarques.AnyAsync(e => e.Id == id, cancellationToken)
            ? await paquetes.ListarDelEmbarqueAsync(id, cancellationToken)
            : null;

    /// <summary>Crea el embarque en ABIERTO. El código (AIR-2026-0001) lo asigna un trigger de la BD.</summary>
    public async Task<ShipmentResponse> CrearAsync(CreateShipmentRequest datos, CancellationToken cancellationToken)
    {
        var codigoMetodo = datos.MetodoEnvio.Trim().ToUpperInvariant();
        var metodo = await db.MetodosEnvio.AsNoTracking().SingleOrDefaultAsync(m => m.Codigo == codigoMetodo, cancellationToken)
            ?? throw new SolicitudInvalidaException($"El método de envío '{datos.MetodoEnvio.Trim()}' no existe.");
        if (!metodo.Activo)
        {
            throw new ConflictoException($"El método de envío {metodo.Codigo} está desactivado.");
        }
        var ruta = await db.Rutas.AsNoTracking().SingleOrDefaultAsync(r => r.Id == datos.RutaId, cancellationToken)
            ?? throw new SolicitudInvalidaException($"La ruta {datos.RutaId} no existe.");
        if (!ruta.Activo)
        {
            throw new ConflictoException($"La ruta {ruta.Nombre} está desactivada.");
        }

        var embarque = new Embarque
        {
            MetodoEnvioId = metodo.Id,
            RutaId = ruta.Id,
            FechaLlegadaEstimada = datos.FechaLlegadaEstimada,
            Observaciones = Opcional(datos.Observaciones),
            CreadoPorUsuarioId = usuarioActual.Id,
        };
        db.Embarques.Add(embarque);
        await db.SaveChangesAsync(cancellationToken);

        logger.LogInformation("Embarque {EmbarqueId} ({Codigo}) creado por el usuario {UsuarioId}.",
            embarque.Id, embarque.CodigoEmbarque, usuarioActual.Id);
        return (await ObtenerAsync(embarque.Id, cancellationToken))!;
    }

    public async Task<ShipmentResponse?> ActualizarAsync(long id, UpdateShipmentRequest datos, CancellationToken cancellationToken)
    {
        await using (var transaccion = await db.Database.BeginTransactionAsync(cancellationToken))
        {
            var embarque = await BloquearAsync(id, cancellationToken);
            if (embarque is null)
            {
                return null;
            }
            ExigirEstado(embarque, "modificar", EstadoEmbarque.Abierto, EstadoEmbarque.Cerrado, EstadoEmbarque.EnTransito);

            embarque.FechaLlegadaEstimada = datos.FechaLlegadaEstimada;
            embarque.Observaciones = Opcional(datos.Observaciones);
            await db.SaveChangesAsync(cancellationToken);
            await transaccion.CommitAsync(cancellationToken);
        }
        return await ObtenerAsync(id, cancellationToken);
    }

    /// <summary>
    /// Asigna paquetes RECIBIDO_EN_MIAMI del mismo método a un embarque ABIERTO y los pasa a
    /// PENDIENTE_DE_ENVIO. Todo o nada: si uno no cumple, no se asigna ninguno.
    /// </summary>
    public async Task<ShipmentResponse?> AsignarAsync(long id, IReadOnlyCollection<long> paqueteIds, CancellationToken cancellationToken)
    {
        await using (var transaccion = await db.Database.BeginTransactionAsync(cancellationToken))
        {
            var embarque = await BloquearAsync(id, cancellationToken);
            if (embarque is null)
            {
                return null;
            }
            ExigirEstado(embarque, "asignarle paquetes", EstadoEmbarque.Abierto);

            var ids = paqueteIds.Distinct().ToArray();
            var bloqueados = await paquetes.BloquearAsync(ids, cancellationToken);
            var faltantes = ids.Except(bloqueados.Select(p => p.Id)).Order().ToList();
            if (faltantes.Count > 0)
            {
                throw new SolicitudInvalidaException($"No existen los paquetes con id {string.Join(", ", faltantes)}.");
            }

            var metodoEmbarque = await CodigoMetodoAsync(embarque.MetodoEnvioId, cancellationToken);
            foreach (var paquete in bloqueados)
            {
                if (paquete.MetodoEnvioId != embarque.MetodoEnvioId)
                {
                    throw new ConflictoException(
                        $"El paquete {paquete.CodigoPaquete} es {await CodigoMetodoAsync(paquete.MetodoEnvioId, cancellationToken)} " +
                        $"y el embarque {embarque.CodigoEmbarque} es {metodoEmbarque}.");
                }
                await paquetes.TransicionarAsync(paquete, EstadoPaquete.PendienteDeEnvio,
                    $"Asignado al embarque {embarque.CodigoEmbarque}", p =>
                    {
                        p.EmbarqueId = embarque.Id;
                        return Task.CompletedTask;
                    }, cancellationToken);
            }
            await transaccion.CommitAsync(cancellationToken);

            logger.LogInformation("{Cantidad} paquetes asignados al embarque {EmbarqueId} ({Codigo}) por el usuario {UsuarioId}.",
                bloqueados.Count, embarque.Id, embarque.CodigoEmbarque, usuarioActual.Id);
        }
        return await ObtenerAsync(id, cancellationToken);
    }

    /// <summary>
    /// Quita un paquete de un embarque ABIERTO: vuelve a RECIBIDO_EN_MIAMI (su fecha de recepción
    /// en Miami no cambia). Null si el embarque no existe.
    /// </summary>
    public async Task<ShipmentResponse?> QuitarPaqueteAsync(long id, long paqueteId, CancellationToken cancellationToken)
    {
        await using (var transaccion = await db.Database.BeginTransactionAsync(cancellationToken))
        {
            var embarque = await BloquearAsync(id, cancellationToken);
            if (embarque is null)
            {
                return null;
            }
            ExigirEstado(embarque, "quitarle paquetes", EstadoEmbarque.Abierto);

            var paquete = (await paquetes.BloquearAsync([paqueteId], cancellationToken)).SingleOrDefault();
            if (paquete is null || paquete.EmbarqueId != embarque.Id)
            {
                throw new ConflictoException($"El paquete {paqueteId} no está en el embarque {embarque.CodigoEmbarque}.");
            }

            await paquetes.TransicionarAsync(paquete, EstadoPaquete.RecibidoEnMiami,
                $"Quitado del embarque {embarque.CodigoEmbarque}", p =>
                {
                    p.EmbarqueId = null;
                    return Task.CompletedTask;
                }, cancellationToken);
            await transaccion.CommitAsync(cancellationToken);
        }
        return await ObtenerAsync(id, cancellationToken);
    }

    /// <summary>ABIERTO → CERRADO (consolidado). Necesita al menos un paquete. No se reabre.</summary>
    public async Task<ShipmentResponse?> CerrarAsync(long id, CancellationToken cancellationToken)
    {
        await using (var transaccion = await db.Database.BeginTransactionAsync(cancellationToken))
        {
            var embarque = await BloquearAsync(id, cancellationToken);
            if (embarque is null)
            {
                return null;
            }
            ExigirEstado(embarque, "cerrarlo", EstadoEmbarque.Abierto);
            if (!await db.Paquetes.AnyAsync(p => p.EmbarqueId == embarque.Id, cancellationToken))
            {
                throw new ConflictoException($"El embarque {embarque.CodigoEmbarque} no tiene paquetes: no se puede cerrar.");
            }

            await CambiarEstadoAsync(embarque, EstadoEmbarque.Cerrado, cancellationToken);
            await transaccion.CommitAsync(cancellationToken);
        }
        return await ObtenerAsync(id, cancellationToken);
    }

    /// <summary>CERRADO → EN_TRANSITO, y todos sus paquetes PENDIENTE_DE_ENVIO → EN_TRANSITO.</summary>
    public async Task<ShipmentResponse?> RegistrarSalidaAsync(long id, DateTimeOffset? fecha, CancellationToken cancellationToken)
    {
        await using (var transaccion = await db.Database.BeginTransactionAsync(cancellationToken))
        {
            var embarque = await BloquearAsync(id, cancellationToken);
            if (embarque is null)
            {
                return null;
            }
            ExigirEstado(embarque, "registrar su salida", EstadoEmbarque.Cerrado);
            var salida = FechaDelHecho(fecha, "salida");

            await MoverPaquetesAsync(embarque, EstadoPaquete.EnTransito,
                $"Salió en el embarque {embarque.CodigoEmbarque}", salida, cancellationToken);
            embarque.FechaSalida = salida;
            await CambiarEstadoAsync(embarque, EstadoEmbarque.EnTransito, cancellationToken);
            await transaccion.CommitAsync(cancellationToken);
        }
        return await ObtenerAsync(id, cancellationToken);
    }

    /// <summary>
    /// EN_TRANSITO → RECIBIDO, y todos sus paquetes EN_TRANSITO → RECIBIDO_EN_NICARAGUA. La fecha de
    /// recepción en Nicaragua de cada paquete es la fecha de llegada indicada.
    /// </summary>
    public async Task<ShipmentResponse?> RegistrarLlegadaAsync(long id, DateTimeOffset? fecha, CancellationToken cancellationToken)
    {
        await using (var transaccion = await db.Database.BeginTransactionAsync(cancellationToken))
        {
            var embarque = await BloquearAsync(id, cancellationToken);
            if (embarque is null)
            {
                return null;
            }
            ExigirEstado(embarque, "registrar su llegada", EstadoEmbarque.EnTransito);
            var llegada = FechaDelHecho(fecha, "llegada");
            if (llegada < embarque.FechaSalida)
            {
                throw new SolicitudInvalidaException(
                    $"La llegada ({llegada:u}) no puede ser anterior a la salida del embarque {embarque.CodigoEmbarque} ({embarque.FechaSalida:u}).");
            }

            await MoverPaquetesAsync(embarque, EstadoPaquete.RecibidoEnNicaragua,
                $"Llegó en el embarque {embarque.CodigoEmbarque}", llegada, cancellationToken);
            embarque.FechaLlegadaReal = llegada;
            await CambiarEstadoAsync(embarque, EstadoEmbarque.Recibido, cancellationToken);
            await transaccion.CommitAsync(cancellationToken);
        }
        return await ObtenerAsync(id, cancellationToken);
    }

    /// <summary>ABIERTO o CERRADO → CANCELADO, solo si no tiene paquetes.</summary>
    public async Task<ShipmentResponse?> CancelarAsync(long id, CancellationToken cancellationToken)
    {
        await using (var transaccion = await db.Database.BeginTransactionAsync(cancellationToken))
        {
            var embarque = await BloquearAsync(id, cancellationToken);
            if (embarque is null)
            {
                return null;
            }
            ExigirEstado(embarque, "cancelarlo", EstadoEmbarque.Abierto, EstadoEmbarque.Cerrado);
            var cantidad = await db.Paquetes.CountAsync(p => p.EmbarqueId == embarque.Id, cancellationToken);
            if (cantidad > 0)
            {
                throw new ConflictoException(
                    $"El embarque {embarque.CodigoEmbarque} tiene {cantidad} paquete(s): quítelos antes de cancelarlo.");
            }

            await CambiarEstadoAsync(embarque, EstadoEmbarque.Cancelado, cancellationToken);
            await transaccion.CommitAsync(cancellationToken);
        }
        return await ObtenerAsync(id, cancellationToken);
    }

    private async Task MoverPaquetesAsync(
        Embarque embarque, EstadoPaquete hacia, string observacion, DateTimeOffset fecha, CancellationToken cancellationToken)
    {
        var delEmbarque = await paquetes.BloquearDelEmbarqueAsync(embarque.Id, cancellationToken);
        if (delEmbarque.Count == 0)
        {
            throw new ConflictoException($"El embarque {embarque.CodigoEmbarque} no tiene paquetes.");
        }
        foreach (var paquete in delEmbarque)
        {
            await paquetes.TransicionarAsync(paquete, hacia, observacion, antes: null, cancellationToken, fecha);
        }
    }

    private async Task CambiarEstadoAsync(Embarque embarque, EstadoEmbarque hacia, CancellationToken cancellationToken)
    {
        var desde = embarque.Estado;
        embarque.Estado = hacia;
        await db.SaveChangesAsync(cancellationToken);
        logger.LogInformation("Embarque {EmbarqueId} ({Codigo}) pasó de {Desde} a {Hacia} por el usuario {UsuarioId}.",
            embarque.Id, embarque.CodigoEmbarque, Codigo(desde), Codigo(hacia), usuarioActual.Id);
    }

    private static void ExigirEstado(Embarque embarque, string accion, params EstadoEmbarque[] permitidos)
    {
        if (!permitidos.Contains(embarque.Estado))
        {
            throw new ConflictoException(
                $"El embarque {embarque.CodigoEmbarque} está {Codigo(embarque.Estado)}: no se puede {accion}.");
        }
    }

    private DateTimeOffset FechaDelHecho(DateTimeOffset? fecha, string hecho) =>
        FechasDelNegocio.DelHecho(fecha, reloj.GetUtcNow(), hecho);

    /// <summary>SELECT … FOR UPDATE del embarque. Requiere una transacción abierta.</summary>
    private async Task<Embarque?> BloquearAsync(long id, CancellationToken cancellationToken) =>
        (await db.Embarques.FromSql($"select * from paqueteria.embarques where id = {id} for update")
            .ToListAsync(cancellationToken))
        .SingleOrDefault();

    private Task<string> CodigoMetodoAsync(short metodoId, CancellationToken cancellationToken) =>
        db.MetodosEnvio.Where(m => m.Id == metodoId).Select(m => m.Codigo).SingleAsync(cancellationToken);

    private static string Codigo(EstadoEmbarque estado) => UpperSnakeEnum<EstadoEmbarque>.ATexto(estado);

    private static string? Opcional(string? valor) => string.IsNullOrWhiteSpace(valor) ? null : valor.Trim();
}
