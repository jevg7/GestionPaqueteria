namespace Paqueteria.Api.Entities;

/// <summary>
/// Documento de cobro. Se guarda junto con sus líneas en la misma transacción: la BD
/// verifica el cuadre (al menos una línea y suma de líneas = subtotal) en el COMMIT.
/// </summary>
/// <remarks>
/// Inmutable una vez emitida. Solo admite EMITIDA -> ANULADA cambiando
/// <see cref="Estado"/>, <see cref="MotivoAnulacion"/> y <see cref="AnuladaEn"/>.
/// El saldo y el estado de pago se leen de <see cref="FacturaSaldo"/>.
/// </remarks>
public class Factura
{
    public long Id { get; set; }

    /// <summary>Agencia dueña de la fila. La pone la BD (variable de sesión paqueteria.agencia_id); el código nunca la asigna.</summary>
    public long AgenciaId { get; private set; }

    /// <summary>FAC-000001, consecutivo sin huecos. Lo genera la BD.</summary>
    public string NumeroFactura { get; private set; } = null!;

    /// <summary>No cambia después de emitir (forma parte de la FK de los pagos).</summary>
    public long ClienteId { get; set; }

    /// <summary>Si no se asigna, la BD pone la fecha actual.</summary>
    public DateTimeOffset Fecha { get; set; }

    public Moneda Moneda { get; set; } = Moneda.Usd;
    public decimal Subtotal { get; set; }
    public decimal Descuento { get; set; }
    public decimal Impuestos { get; set; }

    /// <summary>Debe ser Subtotal - Descuento + Impuestos.</summary>
    public decimal Total { get; set; }

    public EstadoFactura Estado { get; set; } = EstadoFactura.Emitida;
    public string? MotivoAnulacion { get; set; }
    public DateTimeOffset? AnuladaEn { get; set; }

    /// <summary>Quién la emitió.</summary>
    public long UsuarioId { get; set; }

    public DateTimeOffset CreadoEn { get; private set; }
    public DateTimeOffset ActualizadoEn { get; private set; }

    public Cliente Cliente { get; set; } = null!;
    public ICollection<DetalleFactura> Detalles { get; } = [];
    public ICollection<Pago> Pagos { get; } = [];
}
