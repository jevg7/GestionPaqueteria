using System.Globalization;
using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Paqueteria.Api.Auth;
using Paqueteria.Api.Data;
using Paqueteria.Api.DTOs;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.Services;

/// <summary>
/// Entregas: retiro en agencia y delivery (PENDIENTE → EN_RUTA → ENTREGADA o FALLIDA; CANCELADA si no
/// salió). Una fila por paquete; las operaciones reciben varios para una misma visita.
/// </summary>
/// <remarks>
/// Reglas: solo paquetes LISTO_PARA_ENTREGA; un intento vigente por paquete; ningún paquete pasa a
/// ENTREGADO sin su factura saldada (en delivery se cobra el saldo contra entrega en la misma
/// transacción). Un REPARTIDOR solo ve y opera sus entregas. Orden de bloqueo: facturas → paquetes → entregas.
/// </remarks>
public sealed class EntregasService(
    PaqueteriaDbContext db,
    PaquetesService paquetes,
    FacturacionService facturacion,
    UsuarioActual usuarioActual,
    TimeProvider reloj,
    ILogger<EntregasService> logger)
{
    private static readonly Expression<Func<Entrega, DeliveryResponse>> AResponse = e => new DeliveryResponse(
        e.Id,
        new DeliveryPackageRef(e.Paquete.Id, e.Paquete.CodigoPaquete, e.Paquete.Descripcion,
            new PackageStateRef((short)e.Paquete.EstadoActualId, e.Paquete.EstadoActual.Codigo, e.Paquete.EstadoActual.Nombre)),
        new DeliveryClientRef(e.Paquete.Cliente.Id, e.Paquete.Cliente.CodigoCliente, e.Paquete.Cliente.Nombres,
            e.Paquete.Cliente.Apellidos, e.Paquete.Cliente.Telefono),
        e.TipoEntrega,
        e.Estado,
        e.Direccion,
        e.FechaProgramada,
        e.FechaEntrega,
        e.PersonaRecibe,
        e.Responsable != null ? new UserRef(e.Responsable.Id, e.Responsable.Nombres + " " + e.Responsable.Apellidos) : null,
        e.Observaciones,
        null,
        e.CreadoPorUsuarioId,
        e.CreadoEn,
        e.ActualizadoEn);

    /// <summary>REPARTIDOR sin rol de ADMIN ni AGENTE: solo ve y opera las entregas asignadas a él.</summary>
    private bool SoloRepartidor =>
        usuarioActual.Roles.Contains(CodigosRol.Repartidor)
        && !usuarioActual.Roles.Contains(CodigosRol.Admin)
        && !usuarioActual.Roles.Contains(CodigosRol.Agente);

    private IQueryable<Entrega> Visibles()
    {
        var consulta = db.Entregas.AsNoTracking();
        if (SoloRepartidor)
        {
            var yo = usuarioActual.Id;
            consulta = consulta.Where(e => e.ResponsableUsuarioId == yo);
        }
        return consulta;
    }

    public async Task<PagedResponse<DeliveryResponse>> BuscarAsync(DeliverySearchQuery filtro, CancellationToken cancellationToken)
    {
        var consulta = Visibles();
        if (!string.IsNullOrWhiteSpace(filtro.Estado))
        {
            var estado = UpperSnakeEnum<EstadoEntrega>.DesdeTextoDeUsuario(filtro.Estado)
                ?? throw new SolicitudInvalidaException($"El estado de entrega '{filtro.Estado}' no existe.");
            consulta = consulta.Where(e => e.Estado == estado);
        }
        if (!string.IsNullOrWhiteSpace(filtro.TipoEntrega))
        {
            var tipo = UpperSnakeEnum<TipoEntrega>.DesdeTextoDeUsuario(filtro.TipoEntrega)
                ?? throw new SolicitudInvalidaException($"El tipo de entrega '{filtro.TipoEntrega}' no existe.");
            consulta = consulta.Where(e => e.TipoEntrega == tipo);
        }
        if (filtro.ClienteId is { } clienteId)
        {
            consulta = consulta.Where(e => e.Paquete.ClienteId == clienteId);
        }
        if (filtro.PaqueteId is { } paqueteId)
        {
            consulta = consulta.Where(e => e.PaqueteId == paqueteId);
        }
        if (filtro.ResponsableUsuarioId is { } responsable)
        {
            consulta = consulta.Where(e => e.ResponsableUsuarioId == responsable);
        }

        var total = await consulta.CountAsync(cancellationToken);
        var items = await consulta
            .OrderByDescending(e => e.CreadoEn).ThenByDescending(e => e.Id)
            .Skip((filtro.Page - 1) * filtro.PageSize)
            .Take(filtro.PageSize)
            .Select(AResponse)
            .ToListAsync(cancellationToken);

        return new PagedResponse<DeliveryResponse>(await ConCobrosAsync(items, cancellationToken), filtro.Page, filtro.PageSize, total);
    }

    /// <summary>Null si no existe o si es de otro repartidor.</summary>
    public async Task<DeliveryResponse?> ObtenerAsync(long id, CancellationToken cancellationToken) =>
        (await ObtenerVariasAsync([id], cancellationToken)).SingleOrDefault();

    /// <summary>
    /// Los repartidores de la agencia que pueden recibir entregas: usuario activo con el rol REPARTIDOR activo, la misma
    /// regla que <see cref="ValidarRepartidorAsync"/>. Por nombre.
    /// </summary>
    public async Task<IReadOnlyList<UserRef>> RepartidoresAsync(CancellationToken cancellationToken) =>
        await db.UsuarioRoles.AsNoTracking()
            .Where(ur => ur.Usuario.Activo && ur.Rol.Activo && ur.Rol.Codigo == CodigosRol.Repartidor)
            .OrderBy(ur => ur.Usuario.Nombres).ThenBy(ur => ur.Usuario.Apellidos).ThenBy(ur => ur.UsuarioId)
            .Select(ur => new UserRef(ur.Usuario.Id, ur.Usuario.Nombres + " " + ur.Usuario.Apellidos))
            .ToListAsync(cancellationToken);

    /// <summary>Programa el delivery de paquetes LISTO_PARA_ENTREGA de un mismo cliente (PENDIENTE).</summary>
    public async Task<IReadOnlyList<DeliveryResponse>> ProgramarAsync(ScheduleDeliveryRequest datos, CancellationToken cancellationToken)
    {
        List<long> creadas;
        await using (var transaccion = await db.Database.BeginTransactionAsync(cancellationToken))
        {
            var bloqueados = await PaquetesParaEntregarAsync(datos.PaqueteIds, cancellationToken);
            var cliente = await db.Clientes.AsNoTracking().SingleAsync(c => c.Id == bloqueados[0].ClienteId, cancellationToken);
            var direccion = Opcional(datos.Direccion) ?? Opcional(cliente.Direccion)
                ?? throw new SolicitudInvalidaException(
                    $"Indique la dirección de entrega: el cliente {cliente.CodigoCliente} no tiene una registrada.");
            if (datos.ResponsableUsuarioId is { } responsable)
            {
                await ValidarRepartidorAsync(responsable, cancellationToken);
            }

            var entregas = bloqueados.Select(p => new Entrega
            {
                PaqueteId = p.Id,
                TipoEntrega = TipoEntrega.Delivery,
                Direccion = direccion,
                FechaProgramada = datos.FechaProgramada?.ToUniversalTime(),
                ResponsableUsuarioId = datos.ResponsableUsuarioId,
                Observaciones = Opcional(datos.Observaciones),
                CreadoPorUsuarioId = usuarioActual.Id,
            }).ToList();
            db.Entregas.AddRange(entregas);
            await db.SaveChangesAsync(cancellationToken);
            await transaccion.CommitAsync(cancellationToken);
            creadas = entregas.Select(e => e.Id).ToList();

            logger.LogInformation("Delivery programado ({Cantidad} paquete(s), entregas {Entregas}) por el usuario {UsuarioId}.",
                entregas.Count, creadas, usuarioActual.Id);
        }
        return await ObtenerVariasAsync(creadas, cancellationToken);
    }

    /// <summary>
    /// Retiro en agencia: paquetes LISTO_PARA_ENTREGA de un mismo cliente con su factura saldada
    /// (si hay saldo, se cobra antes en caja). Registra las entregas como ENTREGADA y los paquetes ENTREGADO.
    /// </summary>
    public async Task<IReadOnlyList<DeliveryResponse>> RegistrarRetiroAsync(PickupRequest datos, CancellationToken cancellationToken)
    {
        List<long> creadas;
        await using (var transaccion = await db.Database.BeginTransactionAsync(cancellationToken))
        {
            var ids = datos.PaqueteIds.Distinct().ToArray();
            var facturas = await facturacion.FacturasVigentesAsync(ids, cancellationToken);
            await facturacion.BloquearFacturasAsync(facturas.Values.ToList(), cancellationToken);
            var bloqueados = await PaquetesParaEntregarAsync(ids, cancellationToken);
            await ExigirFacturasSaldadasAsync(bloqueados, facturas, cancellationToken);
            var fecha = FechasDelNegocio.DelHecho(datos.Fecha, reloj.GetUtcNow(), "entrega");

            var entregas = bloqueados.Select(p => new Entrega
            {
                PaqueteId = p.Id,
                TipoEntrega = TipoEntrega.RetiroEnAgencia,
                Estado = EstadoEntrega.Entregada,
                FechaEntrega = fecha,
                PersonaRecibe = datos.PersonaRecibe.Trim(),
                Observaciones = Opcional(datos.Observaciones),
                CreadoPorUsuarioId = usuarioActual.Id,
            }).ToList();
            db.Entregas.AddRange(entregas);
            await db.SaveChangesAsync(cancellationToken);
            foreach (var paquete in bloqueados)
            {
                await paquetes.TransicionarAsync(paquete, EstadoPaquete.Entregado, "Retirado en agencia", antes: null, cancellationToken, fecha);
            }
            await transaccion.CommitAsync(cancellationToken);
            creadas = entregas.Select(e => e.Id).ToList();

            logger.LogInformation("Retiro en agencia ({Cantidad} paquete(s), entregas {Entregas}) registrado por el usuario {UsuarioId}.",
                entregas.Count, creadas, usuarioActual.Id);
        }
        return await ObtenerVariasAsync(creadas, cancellationToken);
    }

    /// <summary>
    /// Sale a ruta: entregas PENDIENTE → EN_RUTA y sus paquetes → EN_REPARTO. Un REPARTIDOR sale con
    /// sus entregas (queda como responsable); AGENTE o ADMIN indican el repartidor o usan el asignado.
    /// </summary>
    public async Task<IReadOnlyList<DeliveryResponse>> DespacharAsync(DispatchRequest datos, CancellationToken cancellationToken)
    {
        await using (var transaccion = await db.Database.BeginTransactionAsync(cancellationToken))
        {
            var (entregas, paquetesPorId) = await BloquearEntregasAsync(datos.EntregaIds, facturas: null, cancellationToken);
            if (SoloRepartidor && datos.ResponsableUsuarioId is { } otro && otro != usuarioActual.Id)
            {
                throw new AccesoDenegadoException("Un repartidor solo puede salir a ruta con sus propias entregas.");
            }

            var validados = new HashSet<long>();
            foreach (var entrega in entregas)
            {
                ExigirEstado(entrega, EstadoEntrega.Pendiente, "salir a ruta");
                var responsable = SoloRepartidor
                    ? usuarioActual.Id
                    : datos.ResponsableUsuarioId ?? entrega.ResponsableUsuarioId
                        ?? throw new SolicitudInvalidaException($"Indique el repartidor de la entrega {entrega.Id}.");
                if (entrega.ResponsableUsuarioId is { } asignado && asignado != responsable && SoloRepartidor)
                {
                    throw new AccesoDenegadoException($"La entrega {entrega.Id} está asignada a otro repartidor.");
                }
                if (validados.Add(responsable))
                {
                    await ValidarRepartidorAsync(responsable, cancellationToken);
                }

                entrega.Estado = EstadoEntrega.EnRuta;
                entrega.ResponsableUsuarioId = responsable;
                await paquetes.TransicionarAsync(paquetesPorId[entrega.PaqueteId], EstadoPaquete.EnReparto,
                    $"Salió a reparto (entrega {entrega.Id})", antes: null, cancellationToken);
            }
            await transaccion.CommitAsync(cancellationToken);

            logger.LogInformation("Entregas {Entregas} salieron a ruta; registrado por el usuario {UsuarioId}.",
                entregas.Select(e => e.Id).ToList(), usuarioActual.Id);
        }
        return await ObtenerVariasAsync(datos.EntregaIds, cancellationToken);
    }

    /// <summary>
    /// Delivery confirmado: entregas EN_RUTA de un mismo cliente → ENTREGADA y paquetes → ENTREGADO.
    /// Si alguna factura tiene saldo se cobra completo (contra entrega) en la misma transacción; sin
    /// datos de cobro, 409 (se marca fallida o se indica el cobro).
    /// </summary>
    public async Task<DeliverResponse> ConfirmarEntregaAsync(DeliverRequest datos, CancellationToken cancellationToken)
    {
        var cobros = new List<PaymentResponse>();
        await using (var transaccion = await db.Database.BeginTransactionAsync(cancellationToken))
        {
            var paqueteIds = await db.Entregas.Where(e => datos.EntregaIds.Contains(e.Id)).Select(e => e.PaqueteId).ToListAsync(cancellationToken);
            var facturas = await facturacion.FacturasVigentesAsync(paqueteIds, cancellationToken);
            var (entregas, paquetesPorId) = await BloquearEntregasAsync(datos.EntregaIds, facturas, cancellationToken);
            ExigirMismoCliente(paquetesPorId.Values);
            foreach (var entrega in entregas)
            {
                ExigirEstado(entrega, EstadoEntrega.EnRuta, "confirmarla como entregada");
                ExigirPropia(entrega);
            }
            var fecha = FechasDelNegocio.DelHecho(datos.Fecha, reloj.GetUtcNow(), "entrega");

            foreach (var paquete in paquetesPorId.Values)
            {
                if (!facturas.ContainsKey(paquete.Id))
                {
                    throw new ConflictoException($"El paquete {paquete.CodigoPaquete} no tiene factura vigente: no se puede entregar.");
                }
            }
            foreach (var facturaId in facturas.Values.Distinct().Order())
            {
                var saldo = await facturacion.SaldoDeAsync(facturaId, cancellationToken);
                if (saldo.Saldo == 0)
                {
                    continue;
                }
                if (datos.Cobro is null)
                {
                    throw new ConflictoException(string.Create(CultureInfo.InvariantCulture,
                        $"La factura {saldo.NumeroFactura} tiene saldo pendiente ({saldo.Saldo:0.00} USD): " +
                        $"registre el cobro contra entrega o marque la entrega como fallida."));
                }
                var pago = await facturacion.CobrarSaldoAsync(
                    facturaId, datos.Cobro.Moneda, datos.Cobro.MetodoPago, datos.Cobro.Referencia, cancellationToken);
                if (pago is not null)
                {
                    cobros.Add(pago);
                }
            }

            foreach (var entrega in entregas)
            {
                entrega.Estado = EstadoEntrega.Entregada;
                entrega.FechaEntrega = fecha;
                entrega.PersonaRecibe = datos.PersonaRecibe.Trim();
                await paquetes.TransicionarAsync(paquetesPorId[entrega.PaqueteId], EstadoPaquete.Entregado,
                    $"Entregado a domicilio (entrega {entrega.Id})", antes: null, cancellationToken, fecha);
            }
            await transaccion.CommitAsync(cancellationToken);

            logger.LogInformation("Entregas {Entregas} confirmadas ({Cobros} cobro(s) contra entrega) por el usuario {UsuarioId}.",
                entregas.Select(e => e.Id).ToList(), cobros.Count, usuarioActual.Id);
        }
        return new DeliverResponse(await ObtenerVariasAsync(datos.EntregaIds, cancellationToken), cobros);
    }

    /// <summary>Delivery fallido: EN_RUTA → FALLIDA y el paquete vuelve a LISTO_PARA_ENTREGA (se puede reprogramar).</summary>
    public async Task<IReadOnlyList<DeliveryResponse>> MarcarFallidaAsync(CloseDeliveryRequest datos, CancellationToken cancellationToken)
    {
        var motivo = datos.Motivo.Trim();
        await using (var transaccion = await db.Database.BeginTransactionAsync(cancellationToken))
        {
            var (entregas, paquetesPorId) = await BloquearEntregasAsync(datos.EntregaIds, facturas: null, cancellationToken);
            foreach (var entrega in entregas)
            {
                ExigirEstado(entrega, EstadoEntrega.EnRuta, "marcarla como fallida");
                ExigirPropia(entrega);
                entrega.Estado = EstadoEntrega.Fallida;
                entrega.Observaciones = Agregar(entrega.Observaciones, $"Fallida: {motivo}");
                await paquetes.TransicionarAsync(paquetesPorId[entrega.PaqueteId], EstadoPaquete.ListoParaEntrega,
                    $"Entrega fallida: {motivo}", antes: null, cancellationToken);
            }
            await transaccion.CommitAsync(cancellationToken);

            logger.LogInformation("Entregas {Entregas} marcadas como fallidas por el usuario {UsuarioId}.",
                entregas.Select(e => e.Id).ToList(), usuarioActual.Id);
        }
        return await ObtenerVariasAsync(datos.EntregaIds, cancellationToken);
    }

    /// <summary>Cancela deliveries que no salieron (PENDIENTE → CANCELADA). El paquete sigue LISTO_PARA_ENTREGA.</summary>
    public async Task<IReadOnlyList<DeliveryResponse>> CancelarAsync(CloseDeliveryRequest datos, CancellationToken cancellationToken)
    {
        var motivo = datos.Motivo.Trim();
        await using (var transaccion = await db.Database.BeginTransactionAsync(cancellationToken))
        {
            var (entregas, _) = await BloquearEntregasAsync(datos.EntregaIds, facturas: null, cancellationToken);
            foreach (var entrega in entregas)
            {
                ExigirEstado(entrega, EstadoEntrega.Pendiente, "cancelarla");
                entrega.Estado = EstadoEntrega.Cancelada;
                entrega.Observaciones = Agregar(entrega.Observaciones, $"Cancelada: {motivo}");
            }
            await db.SaveChangesAsync(cancellationToken);
            await transaccion.CommitAsync(cancellationToken);

            logger.LogInformation("Entregas {Entregas} canceladas por el usuario {UsuarioId}.",
                entregas.Select(e => e.Id).ToList(), usuarioActual.Id);
        }
        return await ObtenerVariasAsync(datos.EntregaIds, cancellationToken);
    }

    /// <summary>
    /// Bloquea paquetes LISTO_PARA_ENTREGA de un mismo cliente sin otra entrega vigente. Requiere una
    /// transacción abierta (y las facturas ya bloqueadas si se van a revisar saldos).
    /// </summary>
    private async Task<List<Paquete>> PaquetesParaEntregarAsync(IReadOnlyCollection<long> paqueteIds, CancellationToken cancellationToken)
    {
        var ids = paqueteIds.Distinct().ToArray();
        var bloqueados = await paquetes.BloquearAsync(ids, cancellationToken);
        var faltantes = ids.Except(bloqueados.Select(p => p.Id)).Order().ToList();
        if (faltantes.Count > 0)
        {
            throw new SolicitudInvalidaException($"No existen los paquetes con id {string.Join(", ", faltantes)}.");
        }
        ExigirMismoCliente(bloqueados);
        foreach (var paquete in bloqueados.Where(p => p.EstadoActualId != EstadoPaquete.ListoParaEntrega))
        {
            throw new ConflictoException(
                $"El paquete {paquete.CodigoPaquete} está {TransicionesPaquete.Codigo(paquete.EstadoActualId)}: " +
                "solo se entregan paquetes LISTO_PARA_ENTREGA.");
        }
        var vigente = await db.Entregas
            .Where(e => ids.Contains(e.PaqueteId) && e.Estado != EstadoEntrega.Fallida && e.Estado != EstadoEntrega.Cancelada)
            .Select(e => new { e.Id, e.Paquete.CodigoPaquete, e.Estado })
            .FirstOrDefaultAsync(cancellationToken);
        if (vigente is not null)
        {
            throw new ConflictoException(
                $"El paquete {vigente.CodigoPaquete} ya tiene la entrega {vigente.Id} {UpperSnakeEnum<EstadoEntrega>.ATexto(vigente.Estado)}.");
        }
        return bloqueados;
    }

    private async Task ExigirFacturasSaldadasAsync(List<Paquete> bloqueados, Dictionary<long, long> facturas, CancellationToken cancellationToken)
    {
        foreach (var paquete in bloqueados)
        {
            if (!facturas.TryGetValue(paquete.Id, out var facturaId))
            {
                throw new ConflictoException($"El paquete {paquete.CodigoPaquete} no tiene factura vigente: no se puede entregar.");
            }
            var saldo = await facturacion.SaldoDeAsync(facturaId, cancellationToken);
            if (saldo.Saldo > 0)
            {
                throw new ConflictoException(string.Create(CultureInfo.InvariantCulture,
                    $"El paquete {paquete.CodigoPaquete} tiene saldo pendiente en la factura {saldo.NumeroFactura} " +
                    $"({saldo.Saldo:0.00} USD): regístrelo en caja antes de entregarlo."));
            }
        }
    }

    /// <summary>
    /// Bloquea (facturas →) paquetes → entregas, en ese orden. Las entregas deben existir y ser
    /// visibles para el usuario; un REPARTIDOR no ve las de otros (se informan como inexistentes).
    /// </summary>
    private async Task<(List<Entrega> Entregas, Dictionary<long, Paquete> PaquetesPorId)> BloquearEntregasAsync(
        IReadOnlyCollection<long> entregaIds, Dictionary<long, long>? facturas, CancellationToken cancellationToken)
    {
        var ids = entregaIds.Distinct().ToArray();
        var visibles = await Visibles().Where(e => ids.Contains(e.Id))
            .Select(e => new { e.Id, e.PaqueteId, e.ResponsableUsuarioId })
            .ToListAsync(cancellationToken);
        if (SoloRepartidor)
        {
            // Para salir a ruta, un repartidor también puede tomar entregas PENDIENTE sin asignar.
            var sinAsignar = await db.Entregas.AsNoTracking()
                .Where(e => ids.Contains(e.Id) && e.ResponsableUsuarioId == null)
                .Select(e => new { e.Id, e.PaqueteId, e.ResponsableUsuarioId })
                .ToListAsync(cancellationToken);
            visibles = visibles.Concat(sinAsignar).DistinctBy(e => e.Id).ToList();
        }
        var faltantes = ids.Except(visibles.Select(e => e.Id)).Order().ToList();
        if (faltantes.Count > 0)
        {
            throw new SolicitudInvalidaException($"No existen las entregas con id {string.Join(", ", faltantes)}.");
        }

        if (facturas is not null)
        {
            await facturacion.BloquearFacturasAsync(facturas.Values.ToList(), cancellationToken);
        }
        var paquetesPorId = (await paquetes.BloquearAsync(visibles.Select(e => e.PaqueteId).Distinct().ToList(), cancellationToken))
            .ToDictionary(p => p.Id);
        var entregas = await db.Entregas
            .FromSql($"select * from paqueteria.entregas where id = any({ids}) order by id for update")
            .ToListAsync(cancellationToken);
        return (entregas, paquetesPorId);
    }

    private void ExigirPropia(Entrega entrega)
    {
        if (SoloRepartidor && entrega.ResponsableUsuarioId != usuarioActual.Id)
        {
            throw new AccesoDenegadoException($"La entrega {entrega.Id} está asignada a otro repartidor.");
        }
    }

    private static void ExigirEstado(Entrega entrega, EstadoEntrega requerido, string accion)
    {
        if (entrega.Estado != requerido)
        {
            throw new ConflictoException(
                $"La entrega {entrega.Id} está {UpperSnakeEnum<EstadoEntrega>.ATexto(entrega.Estado)}: no se puede {accion}.");
        }
    }

    private static void ExigirMismoCliente(IEnumerable<Paquete> paquetesDeLaVisita)
    {
        if (paquetesDeLaVisita.Select(p => p.ClienteId).Distinct().Count() > 1)
        {
            throw new ConflictoException("Los paquetes de una misma entrega deben ser del mismo cliente.");
        }
    }

    private async Task ValidarRepartidorAsync(long usuarioId, CancellationToken cancellationToken)
    {
        var esRepartidor = await db.UsuarioRoles.AnyAsync(ur =>
            ur.UsuarioId == usuarioId && ur.Usuario.Activo && ur.Rol.Activo && ur.Rol.Codigo == CodigosRol.Repartidor,
            cancellationToken);
        if (!esRepartidor)
        {
            throw new SolicitudInvalidaException($"El usuario {usuarioId} no es un repartidor activo.");
        }
    }

    private async Task<IReadOnlyList<DeliveryResponse>> ObtenerVariasAsync(IReadOnlyCollection<long> ids, CancellationToken cancellationToken)
    {
        var entregas = await Visibles().Where(e => ids.Contains(e.Id)).OrderBy(e => e.Id).Select(AResponse).ToListAsync(cancellationToken);
        return await ConCobrosAsync(entregas, cancellationToken);
    }

    /// <summary>Agrega a cada entrega lo que falta cobrar de la factura de su paquete (pago contra entrega).</summary>
    private async Task<List<DeliveryResponse>> ConCobrosAsync(List<DeliveryResponse> entregas, CancellationToken cancellationToken)
    {
        if (entregas.Count == 0)
        {
            return entregas;
        }
        var facturas = await facturacion.FacturasVigentesAsync(entregas.Select(e => e.Paquete.Id).Distinct().ToList(), cancellationToken);
        var facturaIds = facturas.Values.Distinct().ToList();
        var conSaldo = await db.FacturasSaldo.AsNoTracking()
            .Where(s => facturaIds.Contains(s.FacturaId) && s.Saldo > 0)
            .ToDictionaryAsync(s => s.FacturaId, cancellationToken);

        return entregas.Select(e =>
            facturas.TryGetValue(e.Paquete.Id, out var facturaId) && conSaldo.TryGetValue(facturaId, out var saldo)
                ? e with { CobroPendiente = new PendingCharge(facturaId, saldo.NumeroFactura, saldo.Saldo) }
                : e)
            .ToList();
    }

    private static string Agregar(string? observaciones, string nota) =>
        string.IsNullOrWhiteSpace(observaciones) ? nota : $"{observaciones} | {nota}";

    private static string? Opcional(string? valor) => string.IsNullOrWhiteSpace(valor) ? null : valor.Trim();
}
