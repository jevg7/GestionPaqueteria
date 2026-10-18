using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Paqueteria.Api.Auth;
using Paqueteria.Api.Data;
using Paqueteria.Api.DTOs;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.Services;

/// <summary>
/// Registro, consulta y edición de paquetes, y las transiciones que pertenecen a este módulo:
/// recepción en Miami, pesaje en Nicaragua y cancelación. Las transiciones de embarques, pagos
/// y entregas las harán sus módulos con <see cref="CambiarEstadoAsync"/> y la misma tabla.
/// </summary>
public sealed class PaquetesService(
    PaqueteriaDbContext db,
    UsuarioActual usuarioActual,
    TimeProvider reloj,
    ILogger<PaquetesService> logger)
{
    private static readonly Expression<Func<Paquete, PackageResponse>> AResponse = p => new PackageResponse(
        p.Id,
        p.CodigoPaquete,
        new PackageClientRef(p.Cliente.Id, p.Cliente.CodigoCliente, p.Cliente.Nombres, p.Cliente.Apellidos),
        p.TrackingExterno,
        p.Tienda,
        p.Descripcion,
        new ShippingMethodRef(p.MetodoEnvio.Codigo, p.MetodoEnvio.Nombre),
        new PackageStateRef((short)p.EstadoActualId, p.EstadoActual.Codigo, p.EstadoActual.Nombre),
        p.Embarque != null ? p.Embarque.CodigoEmbarque : null,
        p.PesoLb,
        p.TarifaAplicada,
        p.MontoCalculado,
        p.FechaRegistro,
        p.FechaRecepcionMiami,
        p.FechaRecepcionNicaragua,
        p.ActualizadoEn);

    public async Task<PagedResponse<PackageResponse>> BuscarAsync(PackageSearchQuery filtro, CancellationToken cancellationToken)
    {
        var consulta = db.Paquetes.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(filtro.Estado))
        {
            var estado = TransicionesPaquete.DesdeCodigo(filtro.Estado)
                ?? throw new SolicitudInvalidaException($"El estado '{filtro.Estado}' no existe.");
            consulta = consulta.Where(p => p.EstadoActualId == estado);
        }
        if (filtro.ClienteId is { } clienteId)
        {
            consulta = consulta.Where(p => p.ClienteId == clienteId);
        }
        if (!string.IsNullOrWhiteSpace(filtro.MetodoEnvio))
        {
            var metodo = filtro.MetodoEnvio.Trim().ToUpperInvariant();
            consulta = consulta.Where(p => p.MetodoEnvio.Codigo == metodo);
        }
        var termino = filtro.Search?.Trim();
        if (!string.IsNullOrEmpty(termino))
        {
            var patron = Busqueda.PatronContiene(termino);
            consulta = consulta.Where(p =>
                EF.Functions.ILike(p.CodigoPaquete, patron, Busqueda.Escape) ||
                EF.Functions.ILike(p.TrackingExterno!, patron, Busqueda.Escape) ||
                EF.Functions.ILike(p.Descripcion, patron, Busqueda.Escape));
        }

        var total = await consulta.CountAsync(cancellationToken);
        var items = await consulta
            .OrderByDescending(p => p.FechaRegistro).ThenByDescending(p => p.Id)
            .Skip((filtro.Page - 1) * filtro.PageSize)
            .Take(filtro.PageSize)
            .Select(AResponse)
            .ToListAsync(cancellationToken);

        return new PagedResponse<PackageResponse>(items, filtro.Page, filtro.PageSize, total);
    }

    public Task<PackageResponse?> ObtenerAsync(long id, CancellationToken cancellationToken) =>
        db.Paquetes.AsNoTracking().Where(p => p.Id == id).Select(AResponse).SingleOrDefaultAsync(cancellationToken);

    /// <summary>
    /// Historial de estados en el orden en que se registraron (por id, no por fecha: una salida o
    /// llegada registrada con fecha pasada no debe aparecer antes de la asignación). Null si el paquete no existe.
    /// </summary>
    public async Task<IReadOnlyList<PackageHistoryEntry>?> HistorialAsync(long id, CancellationToken cancellationToken)
    {
        if (!await db.Paquetes.AnyAsync(p => p.Id == id, cancellationToken))
        {
            return null;
        }

        return await (
            from h in db.HistorialEstadosPaquete.AsNoTracking()
            join u in db.Usuarios on h.UsuarioId equals u.Id
            where h.PaqueteId == id
            orderby h.Id
            select new PackageHistoryEntry(
                h.Id,
                h.Fecha,
                new PackageStateRef((short)h.EstadoId, h.Estado.Codigo, h.Estado.Nombre),
                u.Id,
                u.Nombres + " " + u.Apellidos,
                h.Observacion))
            .ToListAsync(cancellationToken);
    }

    /// <summary>Registra el paquete que avisó el cliente. Nace en REGISTRADO (lo pone la BD).</summary>
    public async Task<PackageResponse> RegistrarAsync(PackageRequest datos, CancellationToken cancellationToken)
    {
        var cliente = await ClienteActivoAsync(datos.ClienteId, cancellationToken);
        var metodo = await MetodoAsync(datos.MetodoEnvio, cancellationToken);
        if (!metodo.Activo)
        {
            throw new ConflictoException($"El método de envío {metodo.Codigo} está desactivado.");
        }
        var tracking = Opcional(datos.TrackingExterno);
        await VerificarTrackingLibreAsync(tracking, excluirPaqueteId: null, cancellationToken);

        var paquete = new Paquete
        {
            ClienteId = cliente.Id,
            MetodoEnvioId = metodo.Id,
            TrackingExterno = tracking,
            Tienda = Opcional(datos.Tienda),
            Descripcion = datos.Descripcion.Trim(),
            RegistradoPorUsuarioId = usuarioActual.Id,
        };
        db.Paquetes.Add(paquete);
        await db.SaveChangesAsync(cancellationToken);

        logger.LogInformation("Paquete {PaqueteId} ({Codigo}) registrado por el usuario {UsuarioId}.",
            paquete.Id, paquete.CodigoPaquete, usuarioActual.Id);
        return (await ObtenerAsync(paquete.Id, cancellationToken))!;
    }

    /// <summary>
    /// Reemplaza los datos del paquete. Tracking, tienda y descripción: mientras no esté facturado
    /// ni en estado final. Cliente y método: además, solo antes de asignarse a un embarque.
    /// </summary>
    public async Task<PackageResponse?> ActualizarAsync(long id, PackageRequest datos, CancellationToken cancellationToken)
    {
        await using var transaccion = await db.Database.BeginTransactionAsync(cancellationToken);
        var paquete = await BloquearAsync(id, cancellationToken);
        if (paquete is null)
        {
            return null;
        }

        if (TransicionesPaquete.EsFinal(paquete.EstadoActualId))
        {
            throw new ConflictoException(
                $"El paquete {paquete.CodigoPaquete} está {TransicionesPaquete.Codigo(paquete.EstadoActualId)} y ya no se puede modificar.");
        }
        await VerificarNoFacturadoAsync(paquete, cancellationToken);

        var metodo = await MetodoAsync(datos.MetodoEnvio, cancellationToken);
        var cambiaCliente = datos.ClienteId != paquete.ClienteId;
        var cambiaMetodo = metodo.Id != paquete.MetodoEnvioId;
        if ((cambiaCliente || cambiaMetodo) && !TransicionesPaquete.PermiteCambiarClienteYMetodo(paquete.EstadoActualId))
        {
            throw new ConflictoException(
                $"El paquete {paquete.CodigoPaquete} está {TransicionesPaquete.Codigo(paquete.EstadoActualId)}: " +
                "el cliente y el método de envío solo se cambian antes de asignarlo a un embarque.");
        }
        if (cambiaCliente)
        {
            paquete.ClienteId = (await ClienteActivoAsync(datos.ClienteId, cancellationToken)).Id;
        }
        if (cambiaMetodo)
        {
            if (!metodo.Activo)
            {
                throw new ConflictoException($"El método de envío {metodo.Codigo} está desactivado.");
            }
            paquete.MetodoEnvioId = metodo.Id;
        }

        var tracking = Opcional(datos.TrackingExterno);
        await VerificarTrackingLibreAsync(tracking, excluirPaqueteId: paquete.Id, cancellationToken);
        paquete.TrackingExterno = tracking;
        paquete.Tienda = Opcional(datos.Tienda);
        paquete.Descripcion = datos.Descripcion.Trim();

        await db.SaveChangesAsync(cancellationToken);
        await transaccion.CommitAsync(cancellationToken);

        logger.LogInformation("Paquete {PaqueteId} ({Codigo}) actualizado por el usuario {UsuarioId}.",
            paquete.Id, paquete.CodigoPaquete, usuarioActual.Id);
        return await ObtenerAsync(id, cancellationToken);
    }

    /// <summary>
    /// REGISTRADO -&gt; RECIBIDO_EN_MIAMI. La fecha de recepción la pone el historial. Un paquete en
    /// PENDIENTE_DE_ENVIO vuelve a RECIBIDO_EN_MIAMI solo quitándolo del embarque (EmbarquesService).
    /// </summary>
    public Task<PackageResponse?> RecibirEnMiamiAsync(long id, string? observacion, CancellationToken cancellationToken) =>
        CambiarEstadoAsync(id, EstadoPaquete.RecibidoEnMiami, Opcional(observacion), p =>
        {
            if (p.EstadoActualId != EstadoPaquete.Registrado)
            {
                throw new ConflictoException(
                    $"El paquete {p.CodigoPaquete} está {TransicionesPaquete.Codigo(p.EstadoActualId)}: " +
                    "solo se recibe en Miami un paquete REGISTRADO. Para devolverlo a bodega, quítelo del embarque.");
            }
            return Task.CompletedTask;
        }, cancellationToken);

    /// <summary>
    /// PAGADO → LISTO_PARA_ENTREGA, o PENDIENTE_DE_PAGO → LISTO_PARA_ENTREGA para pago contra entrega
    /// (exige factura emitida: sin ella no se sabe qué cobrar). Orden de bloqueo: factura → paquete.
    /// </summary>
    public async Task<PackageResponse?> PrepararEntregaAsync(long id, CancellationToken cancellationToken)
    {
        await using (var transaccion = await db.Database.BeginTransactionAsync(cancellationToken))
        {
            if (await FacturaVigenteAsync(id, cancellationToken) is { } factura)
            {
                // Serializa con la anulación de esa factura (que no se permite si el paquete ya está preparado).
                await db.Database.ExecuteSqlAsync(
                    $"select 1 from paqueteria.facturas where id = {factura.Id} for update", cancellationToken);
            }
            var paquete = await BloquearAsync(id, cancellationToken);
            if (paquete is null)
            {
                return null;
            }

            var observacion = "Preparado para entrega";
            if (paquete.EstadoActualId == EstadoPaquete.PendienteDePago)
            {
                var numero = (await FacturaVigenteAsync(id, cancellationToken))?.Numero
                    ?? throw new ConflictoException(
                        $"El paquete {paquete.CodigoPaquete} no tiene factura emitida: factúrelo antes de prepararlo para entrega contra entrega.");
                observacion = $"Preparado para entrega contra entrega (factura {numero})";
            }
            else if (paquete.EstadoActualId != EstadoPaquete.Pagado)
            {
                throw new ConflictoException(
                    $"El paquete {paquete.CodigoPaquete} está {TransicionesPaquete.Codigo(paquete.EstadoActualId)}: " +
                    "solo se prepara para entrega un paquete PAGADO o PENDIENTE_DE_PAGO con factura.");
            }

            await TransicionarAsync(paquete, EstadoPaquete.ListoParaEntrega, observacion, antes: null, cancellationToken);
            await transaccion.CommitAsync(cancellationToken);
        }
        return await ObtenerAsync(id, cancellationToken);
    }

    private async Task<(long Id, string Numero)?> FacturaVigenteAsync(long paqueteId, CancellationToken cancellationToken)
    {
        var factura = await db.DetallesFactura
            .Where(d => d.PaqueteId == paqueteId && d.Factura.Estado != EstadoFactura.Anulada)
            .Select(d => new { d.FacturaId, d.Factura.NumeroFactura })
            .FirstOrDefaultAsync(cancellationToken);
        return factura is null ? null : (factura.FacturaId, factura.NumeroFactura);
    }

    /// <summary>
    /// Registra el peso y calcula el monto con la tarifa vigente el día del pesaje (hora de Managua).
    /// En RECIBIDO_EN_NICARAGUA pasa a PENDIENTE_DE_PAGO. En PENDIENTE_DE_PAGO corrige el peso y
    /// recalcula sin cambiar de estado, si el paquete no está en una factura vigente.
    /// </summary>
    public async Task<PackageResponse?> PesarAsync(long id, decimal pesoLb, CancellationToken cancellationToken)
    {
        await using (var transaccion = await db.Database.BeginTransactionAsync(cancellationToken))
        {
            var paquete = await BloquearAsync(id, cancellationToken);
            if (paquete is null)
            {
                return null;
            }

            if (paquete.EstadoActualId == EstadoPaquete.PendienteDePago)
            {
                await VerificarNoFacturadoAsync(paquete, cancellationToken);
                var pesoAnterior = paquete.PesoLb;
                await AplicarCalculoAsync(paquete, pesoLb, cancellationToken);
                await db.SaveChangesAsync(cancellationToken);
                logger.LogInformation("Paquete {PaqueteId} ({Codigo}): peso corregido de {PesoAnterior} a {Peso} lb por el usuario {UsuarioId}.",
                    paquete.Id, paquete.CodigoPaquete, pesoAnterior, pesoLb, usuarioActual.Id);
            }
            else
            {
                await TransicionarAsync(paquete, EstadoPaquete.PendienteDePago, "Peso registrado y monto calculado",
                    p => AplicarCalculoAsync(p, pesoLb, cancellationToken), cancellationToken);
            }
            await transaccion.CommitAsync(cancellationToken);
        }
        return await ObtenerAsync(id, cancellationToken);
    }

    /// <summary>
    /// Cancela desde REGISTRADO, RECIBIDO_EN_MIAMI o PENDIENTE_DE_ENVIO. Si estaba asignado a un
    /// embarque se quita de él; el historial conserva que estuvo en PENDIENTE_DE_ENVIO.
    /// </summary>
    public Task<PackageResponse?> CancelarAsync(long id, string motivo, CancellationToken cancellationToken) =>
        CambiarEstadoAsync(id, EstadoPaquete.Cancelado, motivo.Trim(), p =>
        {
            p.EmbarqueId = null;
            return Task.CompletedTask;
        }, cancellationToken);

    /// <summary>
    /// Transición de estado: bloquea el paquete (dos solicitudes simultáneas no pueden hacer la
    /// misma transición dos veces), valida con <see cref="TransicionesPaquete"/>, aplica los cambios
    /// e inserta el historial en la misma transacción. Null si el paquete no existe.
    /// </summary>
    public async Task<PackageResponse?> CambiarEstadoAsync(
        long id, EstadoPaquete hacia, string? observacion, Func<Paquete, Task>? antes, CancellationToken cancellationToken)
    {
        await using (var transaccion = await db.Database.BeginTransactionAsync(cancellationToken))
        {
            var paquete = await BloquearAsync(id, cancellationToken);
            if (paquete is null)
            {
                return null;
            }
            await TransicionarAsync(paquete, hacia, observacion, antes, cancellationToken);
            await transaccion.CommitAsync(cancellationToken);
        }
        return await ObtenerAsync(id, cancellationToken);
    }

    /// <summary>
    /// Núcleo de una transición sobre un paquete ya bloqueado (<see cref="BloquearAsync(IReadOnlyCollection{long}, CancellationToken)"/>)
    /// dentro de la transacción en curso: valida, aplica <paramref name="antes"/>, inserta el historial y guarda.
    /// No confirma: lo hace quien abrió la transacción (así un embarque mueve todos sus paquetes o ninguno).
    /// </summary>
    /// <param name="fecha">Fecha del hecho si se registra después (salida o llegada de un embarque); por defecto, ahora.</param>
    public async Task TransicionarAsync(
        Paquete paquete, EstadoPaquete hacia, string? observacion, Func<Paquete, Task>? antes,
        CancellationToken cancellationToken, DateTimeOffset? fecha = null)
    {
        var desde = paquete.EstadoActualId;
        if (!TransicionesPaquete.EstaPermitida(desde, hacia))
        {
            throw new ConflictoException(
                $"El paquete {paquete.CodigoPaquete} está {TransicionesPaquete.Codigo(desde)} " +
                $"y no puede pasar a {TransicionesPaquete.Codigo(hacia)}.");
        }

        if (antes is not null)
        {
            await antes(paquete);
        }
        db.HistorialEstadosPaquete.Add(new HistorialEstadoPaquete
        {
            PaqueteId = paquete.Id,
            EstadoId = hacia,
            UsuarioId = usuarioActual.Id,
            Observacion = observacion,
            Fecha = fecha ?? default, // default: la BD pone now()
        });
        await db.SaveChangesAsync(cancellationToken);

        logger.LogInformation("Paquete {PaqueteId} ({Codigo}) pasó de {Desde} a {Hacia} por el usuario {UsuarioId}.",
            paquete.Id, paquete.CodigoPaquete, TransicionesPaquete.Codigo(desde), TransicionesPaquete.Codigo(hacia), usuarioActual.Id);
    }

    /// <summary>SELECT … FOR UPDATE: requiere una transacción abierta. El paquete queda en seguimiento.</summary>
    private async Task<Paquete?> BloquearAsync(long id, CancellationToken cancellationToken) =>
        (await BloquearAsync([id], cancellationToken)).SingleOrDefault();

    /// <summary>
    /// Bloquea varios paquetes, siempre en orden de id (orden fijo = sin bloqueos mutuos entre
    /// solicitudes). Requiere una transacción abierta. Los que no existen no aparecen.
    /// </summary>
    public async Task<List<Paquete>> BloquearAsync(IReadOnlyCollection<long> ids, CancellationToken cancellationToken)
    {
        var arreglo = ids.ToArray();
        return await db.Paquetes
            .FromSql($"select * from paqueteria.paquetes where id = any({arreglo}) order by id for update")
            .ToListAsync(cancellationToken);
    }

    /// <summary>Bloquea los paquetes asignados a un embarque, en orden de id. Requiere una transacción abierta.</summary>
    public async Task<List<Paquete>> BloquearDelEmbarqueAsync(long embarqueId, CancellationToken cancellationToken) =>
        await db.Paquetes
            .FromSql($"select * from paqueteria.paquetes where embarque_id = {embarqueId} order by id for update")
            .ToListAsync(cancellationToken);

    /// <summary>Paquetes asignados a un embarque, en orden de código.</summary>
    public async Task<IReadOnlyList<PackageResponse>> ListarDelEmbarqueAsync(long embarqueId, CancellationToken cancellationToken) =>
        await db.Paquetes.AsNoTracking()
            .Where(p => p.EmbarqueId == embarqueId)
            .OrderBy(p => p.Id)
            .Select(AResponse)
            .ToListAsync(cancellationToken);

    private async Task AplicarCalculoAsync(Paquete paquete, decimal pesoLb, CancellationToken cancellationToken)
    {
        var fecha = CalculoMonto.FechaEnManagua(reloj.GetUtcNow());
        // fn_tarifa_vigente devuelve una fila con todo NULL si no hay tarifa: se descarta con "id is not null".
        var tarifa = (await db.TarifasEnvio
                .FromSql($"select t.* from paqueteria.fn_tarifa_vigente({paquete.MetodoEnvioId}, {fecha}) as t where t.id is not null")
                .AsNoTracking()
                .ToListAsync(cancellationToken))
            .SingleOrDefault();
        if (tarifa is null)
        {
            var metodo = await db.MetodosEnvio.Where(m => m.Id == paquete.MetodoEnvioId).Select(m => m.Codigo).SingleAsync(cancellationToken);
            throw new ConflictoException(
                $"No hay una tarifa vigente para el método {metodo} el {fecha:yyyy-MM-dd}. Registre la tarifa antes de pesar.");
        }

        paquete.PesoLb = pesoLb;
        paquete.TarifaId = tarifa.Id;
        paquete.TarifaAplicada = tarifa.PrecioPorUnidad;
        paquete.MontoCalculado = CalculoMonto.Calcular(pesoLb, tarifa.PrecioPorUnidad);
    }

    private async Task VerificarNoFacturadoAsync(Paquete paquete, CancellationToken cancellationToken)
    {
        var factura = await db.DetallesFactura
            .Where(d => d.PaqueteId == paquete.Id && d.Factura.Estado != EstadoFactura.Anulada)
            .Select(d => d.Factura.NumeroFactura)
            .FirstOrDefaultAsync(cancellationToken);
        if (factura is not null)
        {
            throw new ConflictoException(
                $"El paquete {paquete.CodigoPaquete} está en la factura {factura}: para modificarlo hay que anular la factura.");
        }
    }

    private async Task<Cliente> ClienteActivoAsync(long clienteId, CancellationToken cancellationToken)
    {
        var cliente = await db.Clientes.AsNoTracking().SingleOrDefaultAsync(c => c.Id == clienteId, cancellationToken)
            ?? throw new SolicitudInvalidaException($"El cliente {clienteId} no existe.");
        if (!cliente.Activo)
        {
            throw new ConflictoException($"El cliente {cliente.CodigoCliente} está desactivado: no se le pueden registrar paquetes.");
        }
        return cliente;
    }

    private async Task<MetodoEnvio> MetodoAsync(string codigo, CancellationToken cancellationToken)
    {
        var normalizado = codigo.Trim().ToUpperInvariant();
        return await db.MetodosEnvio.AsNoTracking().SingleOrDefaultAsync(m => m.Codigo == normalizado, cancellationToken)
            ?? throw new SolicitudInvalidaException($"El método de envío '{codigo.Trim()}' no existe.");
    }

    /// <summary>
    /// El tracking no se repite entre paquetes no cancelados, sin distinguir mayúsculas. La BD lo
    /// garantiza (uq_paquetes_tracking_vigente); aquí se valida antes para responder con el paquete que lo tiene.
    /// </summary>
    private async Task VerificarTrackingLibreAsync(string? tracking, long? excluirPaqueteId, CancellationToken cancellationToken)
    {
        if (tracking is null)
        {
            return;
        }
        var trackingMayusculas = tracking.ToUpperInvariant();
        var existente = await db.Paquetes
            .Where(p => p.TrackingExterno != null
                && p.TrackingExterno.ToUpper() == trackingMayusculas
                && p.EstadoActualId != EstadoPaquete.Cancelado
                && p.Id != excluirPaqueteId)
            .Select(p => p.CodigoPaquete)
            .FirstOrDefaultAsync(cancellationToken);
        if (existente is not null)
        {
            throw new ConflictoException($"El tracking {tracking} ya está registrado en el paquete {existente}.");
        }
    }

    private static string? Opcional(string? valor) => string.IsNullOrWhiteSpace(valor) ? null : valor.Trim();
}
