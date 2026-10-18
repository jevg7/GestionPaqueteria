using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Paqueteria.Api.Auth;
using Paqueteria.Api.Data;
using Paqueteria.Api.DTOs;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.Services;

/// <summary>
/// Facturas (comprobante interno en USD) y pagos (en USD o córdobas). Facturas, líneas y pagos son
/// inmutables: solo se anulan, con motivo. El saldo y el estado de pago salen de v_facturas_saldo.
/// </summary>
/// <remarks>
/// Orden de bloqueo: primero la factura (FOR UPDATE), después sus paquetes por id. Al saldar la
/// factura, sus paquetes pasan a PAGADO en la misma transacción que el pago; al anular un pago de
/// una factura saldada, vuelven a PENDIENTE_DE_PAGO si siguen en PAGADO.
/// </remarks>
public sealed class FacturacionService(
    PaqueteriaDbContext db,
    PaquetesService paquetes,
    TiposCambioService tiposCambio,
    UsuarioActual usuarioActual,
    TimeProvider reloj,
    ILogger<FacturacionService> logger)
{
    public async Task<PagedResponse<InvoiceSummaryResponse>> BuscarAsync(InvoiceSearchQuery filtro, CancellationToken cancellationToken)
    {
        var consulta =
            from s in db.FacturasSaldo.AsNoTracking()
            join c in db.Clientes on s.ClienteId equals c.Id
            select new { Saldo = s, Cliente = c };

        if (filtro.ClienteId is { } clienteId)
        {
            consulta = consulta.Where(x => x.Saldo.ClienteId == clienteId);
        }
        if (!string.IsNullOrWhiteSpace(filtro.EstadoPago))
        {
            var estado = UpperSnakeEnum<EstadoPagoFactura>.DesdeTextoDeUsuario(filtro.EstadoPago)
                ?? throw new SolicitudInvalidaException($"El estado de pago '{filtro.EstadoPago}' no existe.");
            consulta = consulta.Where(x => x.Saldo.EstadoPago == estado);
        }
        var termino = filtro.Search?.Trim();
        if (!string.IsNullOrEmpty(termino))
        {
            var patron = Busqueda.PatronContiene(termino);
            consulta = consulta.Where(x => EF.Functions.ILike(x.Saldo.NumeroFactura, patron, Busqueda.Escape));
        }

        var total = await consulta.CountAsync(cancellationToken);
        var items = await consulta
            .OrderByDescending(x => x.Saldo.Fecha).ThenByDescending(x => x.Saldo.FacturaId)
            .Skip((filtro.Page - 1) * filtro.PageSize)
            .Take(filtro.PageSize)
            .Select(x => new InvoiceSummaryResponse(
                x.Saldo.FacturaId,
                x.Saldo.NumeroFactura,
                new PackageClientRef(x.Cliente.Id, x.Cliente.CodigoCliente, x.Cliente.Nombres, x.Cliente.Apellidos),
                x.Saldo.Fecha,
                x.Saldo.Total,
                x.Saldo.Pagado,
                x.Saldo.Saldo,
                x.Saldo.Estado,
                x.Saldo.EstadoPago))
            .ToListAsync(cancellationToken);

        return new PagedResponse<InvoiceSummaryResponse>(items, filtro.Page, filtro.PageSize, total);
    }

    public async Task<InvoiceResponse?> ObtenerAsync(long id, CancellationToken cancellationToken)
    {
        var cabecera = await (
            from f in db.Facturas.AsNoTracking()
            join s in db.FacturasSaldo on f.Id equals s.FacturaId
            where f.Id == id
            select new
            {
                Factura = f,
                Cliente = new PackageClientRef(f.Cliente.Id, f.Cliente.CodigoCliente, f.Cliente.Nombres, f.Cliente.Apellidos),
                s.Pagado,
                s.Saldo,
                s.EstadoPago,
            })
            .SingleOrDefaultAsync(cancellationToken);
        if (cabecera is null)
        {
            return null;
        }

        var lineas = await db.DetallesFactura.AsNoTracking()
            .Where(d => d.FacturaId == id)
            .OrderBy(d => d.Id)
            .Select(d => new InvoiceLineResponse(
                d.Id, d.PaqueteId, d.Paquete != null ? d.Paquete.CodigoPaquete : null,
                d.Descripcion, d.Cantidad, d.PrecioUnitario, d.Subtotal))
            .ToListAsync(cancellationToken);
        var pagos = await db.Pagos.AsNoTracking()
            .Where(p => p.FacturaId == id)
            .OrderBy(p => p.Id)
            .Select(p => ARespuesta(p, cabecera.Factura.NumeroFactura))
            .ToListAsync(cancellationToken);

        var factura = cabecera.Factura;
        return new InvoiceResponse(
            factura.Id, factura.NumeroFactura, cabecera.Cliente, factura.Fecha, factura.Moneda, factura.Subtotal,
            factura.Descuento, factura.Impuestos, factura.Total, cabecera.Pagado, cabecera.Saldo, factura.Estado,
            cabecera.EstadoPago, factura.MotivoAnulacion, factura.AnuladaEn, factura.UsuarioId, lineas, pagos);
    }

    /// <summary>
    /// Emite la factura de paquetes PENDIENTE_DE_PAGO de un cliente: una línea por paquete
    /// (peso × tarifa aplicada = monto calculado). Sin descuento ni impuestos: la tarifa incluye el IVA.
    /// Factura y líneas se guardan en un solo SaveChanges (la BD verifica el cuadre al confirmar).
    /// </summary>
    public async Task<InvoiceResponse> EmitirAsync(CreateInvoiceRequest datos, CancellationToken cancellationToken)
    {
        long facturaId;
        await using (var transaccion = await db.Database.BeginTransactionAsync(cancellationToken))
        {
            var cliente = await db.Clientes.AsNoTracking().SingleOrDefaultAsync(c => c.Id == datos.ClienteId, cancellationToken)
                ?? throw new SolicitudInvalidaException($"El cliente {datos.ClienteId} no existe.");

            var ids = datos.PaqueteIds.Distinct().ToArray();
            var bloqueados = await paquetes.BloquearAsync(ids, cancellationToken);
            var faltantes = ids.Except(bloqueados.Select(p => p.Id)).Order().ToList();
            if (faltantes.Count > 0)
            {
                throw new SolicitudInvalidaException($"No existen los paquetes con id {string.Join(", ", faltantes)}.");
            }

            var metodos = await db.MetodosEnvio.AsNoTracking().ToDictionaryAsync(m => m.Id, m => m.Nombre, cancellationToken);
            var factura = new Factura { ClienteId = cliente.Id, UsuarioId = usuarioActual.Id };
            foreach (var paquete in bloqueados)
            {
                if (paquete.ClienteId != cliente.Id)
                {
                    throw new ConflictoException($"El paquete {paquete.CodigoPaquete} no es del cliente {cliente.CodigoCliente}.");
                }
                if (paquete.EstadoActualId != EstadoPaquete.PendienteDePago || paquete.MontoCalculado is null)
                {
                    throw new ConflictoException(
                        $"El paquete {paquete.CodigoPaquete} está {TransicionesPaquete.Codigo(paquete.EstadoActualId)}: " +
                        "solo se facturan paquetes PENDIENTE_DE_PAGO.");
                }
                if (await NumeroFacturaVigenteAsync(paquete.Id, cancellationToken) is { } numero)
                {
                    throw new ConflictoException($"El paquete {paquete.CodigoPaquete} ya está en la factura {numero}.");
                }

                factura.Detalles.Add(new DetalleFactura
                {
                    PaqueteId = paquete.Id,
                    Descripcion = string.Create(CultureInfo.InvariantCulture,
                        $"Envío {metodos[paquete.MetodoEnvioId].ToLowerInvariant()} {paquete.CodigoPaquete}: " +
                        $"{paquete.PesoLb:0.00} lb × {paquete.TarifaAplicada:0.00##} USD/lb"),
                    Cantidad = paquete.PesoLb!.Value,
                    PrecioUnitario = paquete.TarifaAplicada!.Value,
                    Subtotal = paquete.MontoCalculado.Value,
                });
            }
            factura.Subtotal = factura.Detalles.Sum(d => d.Subtotal);
            factura.Total = factura.Subtotal;

            db.Facturas.Add(factura);
            await db.SaveChangesAsync(cancellationToken);
            await transaccion.CommitAsync(cancellationToken);
            facturaId = factura.Id;

            logger.LogInformation("Factura {FacturaId} ({Numero}) emitida por {Total} USD con {Cantidad} paquete(s), por el usuario {UsuarioId}.",
                factura.Id, factura.NumeroFactura, factura.Total, factura.Detalles.Count, usuarioActual.Id);
        }
        return (await ObtenerAsync(facturaId, cancellationToken))!;
    }

    /// <summary>
    /// Registra un pago. En córdobas se abona round(córdobas ÷ tipo de cambio vigente, 2) USD. Si el
    /// pago salda la factura, sus paquetes pasan a PAGADO en la misma transacción. Null si la factura no existe.
    /// </summary>
    public async Task<PaymentResponse?> RegistrarPagoAsync(long facturaId, CreatePaymentRequest datos, CancellationToken cancellationToken)
    {
        await using var transaccion = await db.Database.BeginTransactionAsync(cancellationToken);
        var factura = await BloquearFacturaAsync(facturaId, cancellationToken);
        if (factura is null)
        {
            return null;
        }
        var pago = await AplicarPagoAsync(factura, datos, cancellationToken);
        await transaccion.CommitAsync(cancellationToken);
        return pago;
    }

    /// <summary>
    /// Cobro contra entrega: registra un pago por el saldo completo de la factura (en córdobas, su
    /// equivalente exacto). Requiere una transacción abierta y la factura ya bloqueada
    /// (<see cref="BloquearFacturasAsync"/>). Null si la factura no tenía saldo.
    /// </summary>
    public async Task<PaymentResponse?> CobrarSaldoAsync(
        long facturaId, Moneda moneda, MetodoPago metodoPago, string? referencia, CancellationToken cancellationToken)
    {
        var factura = (await BloquearFacturasAsync([facturaId], cancellationToken)).Single();
        var saldo = await SaldoAsync(factura.Id, cancellationToken);
        if (saldo == 0)
        {
            return null;
        }
        var monto = saldo;
        if (moneda == Moneda.Nio)
        {
            var tipoCambio = await tiposCambio.VigenteAsync(cancellationToken)
                ?? throw new ConflictoException("No hay un tipo de cambio registrado: el administrador debe registrarlo antes de recibir córdobas.");
            monto = CalculoMonto.ACordobas(saldo, tipoCambio.NioPorUsd);
        }
        return await AplicarPagoAsync(factura, new CreatePaymentRequest(moneda, monto, metodoPago, referencia), cancellationToken);
    }

    /// <summary>
    /// Núcleo de un pago sobre una factura ya bloqueada, dentro de la transacción en curso. Si salda
    /// la factura, pasan a PAGADO los paquetes que siguen en PENDIENTE_DE_PAGO; los que ya salieron a
    /// entrega (pago contra entrega) conservan su estado.
    /// </summary>
    private async Task<PaymentResponse> AplicarPagoAsync(Factura factura, CreatePaymentRequest datos, CancellationToken cancellationToken)
    {
        if (factura.Estado == EstadoFactura.Anulada)
        {
            throw new ConflictoException($"La factura {factura.NumeroFactura} está anulada: no admite pagos.");
        }
        var saldo = await SaldoAsync(factura.Id, cancellationToken);
        if (saldo == 0)
        {
            throw new ConflictoException($"La factura {factura.NumeroFactura} ya está pagada.");
        }

        var pago = new Pago
        {
            FacturaId = factura.Id,
            ClienteId = factura.ClienteId,
            Moneda = datos.Moneda,
            MetodoPago = datos.MetodoPago,
            Referencia = string.IsNullOrWhiteSpace(datos.Referencia) ? null : datos.Referencia.Trim(),
            UsuarioId = usuarioActual.Id,
        };
        string equivalenteSaldo;
        if (datos.Moneda == Moneda.Nio)
        {
            var tipoCambio = await tiposCambio.VigenteAsync(cancellationToken)
                ?? throw new ConflictoException("No hay un tipo de cambio registrado: el administrador debe registrarlo antes de recibir córdobas.");
            pago.MontoMoneda = datos.Monto;
            pago.TipoCambioAplicado = tipoCambio.NioPorUsd;
            pago.Monto = CalculoMonto.ADolares(datos.Monto, tipoCambio.NioPorUsd);
            equivalenteSaldo = string.Create(CultureInfo.InvariantCulture,
                $" = C$ {CalculoMonto.ACordobas(saldo, tipoCambio.NioPorUsd):0.00} al tipo de cambio {tipoCambio.NioPorUsd:0.0000} del {tipoCambio.Fecha:yyyy-MM-dd}");
            if (pago.Monto == 0)
            {
                throw new SolicitudInvalidaException("El monto en córdobas equivale a menos de 0.01 USD.");
            }
        }
        else
        {
            pago.Monto = datos.Monto;
            equivalenteSaldo = "";
        }

        if (pago.Monto > saldo)
        {
            throw new ConflictoException(string.Create(CultureInfo.InvariantCulture,
                $"El pago ({pago.Monto:0.00} USD) excede el saldo de la factura {factura.NumeroFactura} ({saldo:0.00} USD{equivalenteSaldo})."));
        }

        db.Pagos.Add(pago);
        await db.SaveChangesAsync(cancellationToken);

        if (pago.Monto == saldo)
        {
            var pendientes = (await PaquetesDeLaFacturaAsync(factura.Id, cancellationToken))
                .Where(p => p.EstadoActualId == EstadoPaquete.PendienteDePago);
            foreach (var paquete in pendientes)
            {
                await paquetes.TransicionarAsync(paquete, EstadoPaquete.Pagado, $"Factura {factura.NumeroFactura} pagada", antes: null, cancellationToken);
            }
        }

        logger.LogInformation("Pago {PagoId} de {Monto} USD ({Moneda}) a la factura {Numero} registrado por el usuario {UsuarioId}.",
            pago.Id, pago.Monto, UpperSnakeEnum<Moneda>.ATexto(pago.Moneda), factura.NumeroFactura, usuarioActual.Id);
        return ARespuesta(pago, factura.NumeroFactura);
    }

    /// <summary>EMITIDA → ANULADA, solo sin pagos aplicados. Sus paquetes siguen PENDIENTE_DE_PAGO y se pueden refacturar.</summary>
    public async Task<InvoiceResponse?> AnularFacturaAsync(long id, string motivo, CancellationToken cancellationToken)
    {
        await using (var transaccion = await db.Database.BeginTransactionAsync(cancellationToken))
        {
            var factura = await BloquearFacturaAsync(id, cancellationToken);
            if (factura is null)
            {
                return null;
            }
            if (factura.Estado == EstadoFactura.Anulada)
            {
                throw new ConflictoException($"La factura {factura.NumeroFactura} ya está anulada.");
            }
            if (await db.Pagos.AnyAsync(p => p.FacturaId == id && p.Estado == EstadoPago.Aplicado, cancellationToken))
            {
                throw new ConflictoException($"La factura {factura.NumeroFactura} tiene pagos aplicados: anúlelos antes de anular la factura.");
            }
            // Pago contra entrega: un paquete preparado o en ruta sin factura vigente no tendría qué cobrarse.
            if ((await PaquetesDeLaFacturaAsync(factura.Id, cancellationToken))
                .FirstOrDefault(p => p.EstadoActualId != EstadoPaquete.PendienteDePago) is { } preparado)
            {
                throw new ConflictoException(
                    $"El paquete {preparado.CodigoPaquete} ya está {TransicionesPaquete.Codigo(preparado.EstadoActualId)}: " +
                    $"no se puede anular la factura {factura.NumeroFactura}.");
            }

            factura.Estado = EstadoFactura.Anulada;
            factura.MotivoAnulacion = motivo.Trim();
            factura.AnuladaEn = reloj.GetUtcNow();
            await db.SaveChangesAsync(cancellationToken);
            await transaccion.CommitAsync(cancellationToken);

            logger.LogInformation("Factura {FacturaId} ({Numero}) anulada por el usuario {UsuarioId}.",
                factura.Id, factura.NumeroFactura, usuarioActual.Id);
        }
        return await ObtenerAsync(id, cancellationToken);
    }

    /// <summary>
    /// APLICADO → ANULADO. No se anula si algún paquete de la factura ya está ENTREGADO (409). Si la
    /// factura estaba saldada, sus paquetes en PAGADO vuelven a PENDIENTE_DE_PAGO; los que ya están
    /// preparados o en ruta siguen así y se cobrarán contra entrega. Null si el pago no existe.
    /// </summary>
    public async Task<PaymentResponse?> AnularPagoAsync(long pagoId, string motivo, CancellationToken cancellationToken)
    {
        await using var transaccion = await db.Database.BeginTransactionAsync(cancellationToken);
        var facturaId = await db.Pagos.Where(p => p.Id == pagoId).Select(p => (long?)p.FacturaId).SingleOrDefaultAsync(cancellationToken);
        if (facturaId is null)
        {
            return null;
        }
        var factura = (await BloquearFacturaAsync(facturaId.Value, cancellationToken))!;
        var pago = await db.Pagos.SingleAsync(p => p.Id == pagoId, cancellationToken);
        if (pago.Estado == EstadoPago.Anulado)
        {
            throw new ConflictoException($"El pago {pago.Id} de la factura {factura.NumeroFactura} ya está anulado.");
        }

        var paquetesDeLaFactura = await PaquetesDeLaFacturaAsync(factura.Id, cancellationToken);
        if (paquetesDeLaFactura.FirstOrDefault(p => p.EstadoActualId == EstadoPaquete.Entregado) is { } entregado)
        {
            throw new ConflictoException(
                $"El paquete {entregado.CodigoPaquete} de la factura {factura.NumeroFactura} ya está ENTREGADO: no se puede anular el pago.");
        }
        var estabaSaldada = await SaldoAsync(factura.Id, cancellationToken) == 0;

        pago.Estado = EstadoPago.Anulado;
        pago.MotivoAnulacion = motivo.Trim();
        pago.AnuladoEn = reloj.GetUtcNow();
        await db.SaveChangesAsync(cancellationToken);

        var pagados = estabaSaldada ? paquetesDeLaFactura.Where(p => p.EstadoActualId == EstadoPaquete.Pagado) : [];
        foreach (var paquete in pagados)
        {
            await paquetes.TransicionarAsync(paquete, EstadoPaquete.PendienteDePago,
                $"Pago {pago.Id} anulado: la factura {factura.NumeroFactura} ya no está saldada", antes: null, cancellationToken);
        }
        await transaccion.CommitAsync(cancellationToken);

        logger.LogInformation("Pago {PagoId} de la factura {Numero} anulado por el usuario {UsuarioId}.",
            pago.Id, factura.NumeroFactura, usuarioActual.Id);
        return ARespuesta(pago, factura.NumeroFactura);
    }

    /// <summary>Factura vigente (no anulada) de cada paquete que tenga una: paqueteId → facturaId.</summary>
    public async Task<Dictionary<long, long>> FacturasVigentesAsync(IReadOnlyCollection<long> paqueteIds, CancellationToken cancellationToken) =>
        await db.DetallesFactura
            .Where(d => d.PaqueteId != null && paqueteIds.Contains(d.PaqueteId.Value) && d.Factura.Estado != EstadoFactura.Anulada)
            .ToDictionaryAsync(d => d.PaqueteId!.Value, d => d.FacturaId, cancellationToken);

    /// <summary>Saldo pendiente (USD) y número de una factura.</summary>
    public Task<FacturaSaldo> SaldoDeAsync(long facturaId, CancellationToken cancellationToken) =>
        db.FacturasSaldo.AsNoTracking().SingleAsync(s => s.FacturaId == facturaId, cancellationToken);

    /// <summary>
    /// Bloquea facturas en orden de id. Requiere una transacción abierta. Orden global de bloqueo:
    /// facturas → paquetes → entregas.
    /// </summary>
    public async Task<List<Factura>> BloquearFacturasAsync(IReadOnlyCollection<long> ids, CancellationToken cancellationToken)
    {
        var arreglo = ids.Distinct().ToArray();
        return await db.Facturas
            .FromSql($"select * from paqueteria.facturas where id = any({arreglo}) order by id for update")
            .ToListAsync(cancellationToken);
    }

    private Task<string?> NumeroFacturaVigenteAsync(long paqueteId, CancellationToken cancellationToken) =>
        db.DetallesFactura
            .Where(d => d.PaqueteId == paqueteId && d.Factura.Estado != EstadoFactura.Anulada)
            .Select(d => d.Factura.NumeroFactura)
            .FirstOrDefaultAsync(cancellationToken);

    /// <summary>Saldo en USD desde v_facturas_saldo (dentro de la transacción ve los pagos recién guardados).</summary>
    private Task<decimal> SaldoAsync(long facturaId, CancellationToken cancellationToken) =>
        db.FacturasSaldo.Where(s => s.FacturaId == facturaId).Select(s => s.Saldo).SingleAsync(cancellationToken);

    private async Task<List<Paquete>> PaquetesDeLaFacturaAsync(long facturaId, CancellationToken cancellationToken)
    {
        var ids = await db.DetallesFactura
            .Where(d => d.FacturaId == facturaId && d.PaqueteId != null)
            .Select(d => d.PaqueteId!.Value)
            .ToListAsync(cancellationToken);
        return await paquetes.BloquearAsync(ids, cancellationToken);
    }

    /// <summary>SELECT … FOR UPDATE de la factura. Requiere una transacción abierta.</summary>
    private async Task<Factura?> BloquearFacturaAsync(long id, CancellationToken cancellationToken) =>
        (await BloquearFacturasAsync([id], cancellationToken))
        .SingleOrDefault();

    private static PaymentResponse ARespuesta(Pago p, string numeroFactura) => new(
        p.Id, p.FacturaId, numeroFactura, p.Monto, p.Moneda, p.MontoMoneda, p.TipoCambioAplicado, p.MetodoPago,
        p.Referencia, p.Fecha, p.Estado, p.MotivoAnulacion, p.AnuladoEn, p.UsuarioId);
}
