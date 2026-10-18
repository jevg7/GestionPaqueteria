using Microsoft.EntityFrameworkCore;
using Npgsql;
using Paqueteria.Api.Data;
using Paqueteria.Api.Entities;
using Paqueteria.IntegrationTests.Infrastructure;

namespace Paqueteria.IntegrationTests;

/// <summary>
/// El cuadre de la factura (≥ 1 línea y suma de líneas = subtotal) se verifica en el COMMIT,
/// así que factura y líneas deben guardarse en la misma transacción.
/// </summary>
public class FacturaCuadreTests(ServidorPostgres servidor) : PruebaConBaseDeDatos(servidor)
{
    [Fact]
    public async Task FacturaYLineasEnUnSoloSaveChanges_SeEmite()
    {
        await using var db = NuevoContexto();
        var (paquete, usuario) = await CrearPaqueteCalculadoAsync(db);
        var factura = NuevaFactura(paquete, usuario);
        factura.Detalles.Add(LineaDe(paquete));

        db.Facturas.Add(factura);
        await db.SaveChangesAsync(Ct);

        Assert.Equal("FAC-000001", factura.NumeroFactura);
        await using var otra = NuevoContexto();
        var saldo = await otra.FacturasSaldo.SingleAsync(s => s.FacturaId == factura.Id, Ct);
        Assert.Equal(EstadoFactura.Emitida, saldo.Estado);
        Assert.Equal(EstadoPagoFactura.Pendiente, saldo.EstadoPago);
        Assert.Equal(0m, saldo.Pagado);
        Assert.Equal(15.75m, saldo.Saldo);
    }

    [Fact]
    public async Task FacturaYLineasEnDosSaveChangesSinTransaccion_FallaEnElCommit()
    {
        await using var db = NuevoContexto();
        var (paquete, usuario) = await CrearPaqueteCalculadoAsync(db);
        var factura = NuevaFactura(paquete, usuario);

        db.Facturas.Add(factura);
        var error = await Record.ExceptionAsync(() => db.SaveChangesAsync(Ct));

        // El INSERT pasa; la verificación diferida rechaza el COMMIT. Según dónde falle, EF
        // puede entregar la PostgresException envuelta o no: se busca en toda la cadena.
        var postgres = BuscarPostgresException(error);
        Assert.Equal(PostgresErrorCodes.CheckViolation, postgres.SqlState);
        Assert.Contains("no tiene líneas", postgres.MessageText);

        await using var otra = NuevoContexto();
        Assert.Equal(0, await otra.Facturas.CountAsync(Ct));

        // El correlativo se revirtió con la transacción: la siguiente factura no deja hueco.
        var valida = NuevaFactura(paquete, usuario);
        valida.Detalles.Add(LineaDe(paquete));
        otra.Facturas.Add(valida);
        await otra.SaveChangesAsync(Ct);
        Assert.Equal("FAC-000001", valida.NumeroFactura);
    }

    [Fact]
    public async Task FacturaYLineasEnDosSaveChangesConTransaccionExplicita_SeEmite()
    {
        await using var db = NuevoContexto();
        var (paquete, usuario) = await CrearPaqueteCalculadoAsync(db);
        var factura = NuevaFactura(paquete, usuario);

        await using (var transaccion = await db.Database.BeginTransactionAsync(Ct))
        {
            db.Facturas.Add(factura);
            await db.SaveChangesAsync(Ct);
            factura.Detalles.Add(LineaDe(paquete));
            await db.SaveChangesAsync(Ct);
            await transaccion.CommitAsync(Ct);
        }

        await using var otra = NuevoContexto();
        Assert.Equal(1, await otra.DetallesFactura.CountAsync(d => d.FacturaId == factura.Id, Ct));
    }

    /// <summary>Paquete aéreo de 4.5 lb con la tarifa del seed (3.50): monto 15.75.</summary>
    private static async Task<(Paquete Paquete, Usuario Usuario)> CrearPaqueteCalculadoAsync(PaqueteriaDbContext db)
    {
        var usuario = await CrearUsuarioAsync(db);
        var paquete = await CrearPaqueteAereoAsync(db, await CrearClienteAsync(db), usuario);
        var tarifa = await db.TarifasEnvio.SingleAsync(t => t.MetodoEnvioId == paquete.MetodoEnvioId && t.Activo, Ct);

        paquete.PesoLb = 4.5m;
        paquete.TarifaId = tarifa.Id;
        paquete.TarifaAplicada = tarifa.PrecioPorUnidad;
        paquete.MontoCalculado = Math.Round(paquete.PesoLb.Value * tarifa.PrecioPorUnidad, 2, MidpointRounding.AwayFromZero);
        await db.SaveChangesAsync(Ct);

        Assert.Equal(15.75m, paquete.MontoCalculado);
        return (paquete, usuario);
    }

    private static Factura NuevaFactura(Paquete paquete, Usuario usuario) => new()
    {
        ClienteId = paquete.ClienteId,
        Subtotal = paquete.MontoCalculado!.Value,
        Total = paquete.MontoCalculado!.Value,
        UsuarioId = usuario.Id,
    };

    private static DetalleFactura LineaDe(Paquete paquete) => new()
    {
        PaqueteId = paquete.Id,
        Descripcion = $"Envío aéreo {paquete.CodigoPaquete}",
        Cantidad = paquete.PesoLb!.Value,
        PrecioUnitario = paquete.TarifaAplicada!.Value,
        Subtotal = paquete.MontoCalculado!.Value,
    };

    private static PostgresException BuscarPostgresException(Exception? error)
    {
        for (var actual = error; actual is not null; actual = actual.InnerException)
        {
            if (actual is PostgresException postgres)
            {
                return postgres;
            }
        }
        throw new Xunit.Sdk.XunitException($"Se esperaba una PostgresException y se obtuvo: {error}");
    }
}
