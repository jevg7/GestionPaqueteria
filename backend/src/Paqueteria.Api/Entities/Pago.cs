namespace Paqueteria.Api.Entities;

/// <summary>
/// Pago aplicado a una factura (se admiten pagos parciales). Inmutable: solo admite
/// APLICADO -> ANULADO cambiando <see cref="Estado"/>, <see cref="MotivoAnulacion"/> y
/// <see cref="AnuladoEn"/>.
/// </summary>
public class Pago
{
    public long Id { get; set; }

    /// <summary>Agencia dueña de la fila. La pone la BD (variable de sesión paqueteria.agencia_id); el código nunca la asigna.</summary>
    public long AgenciaId { get; private set; }
    public long FacturaId { get; set; }

    /// <summary>Debe ser el cliente de la factura (FK compuesta en la BD).</summary>
    public long ClienteId { get; set; }

    /// <summary>Lo que se abona a la factura, en USD. En un pago en córdobas: round(MontoMoneda ÷ TipoCambioAplicado, 2).</summary>
    public decimal Monto { get; set; }

    /// <summary>Moneda en que se recibió el pago.</summary>
    public Moneda Moneda { get; set; } = Moneda.Usd;

    /// <summary>Monto recibido en córdobas. Null si el pago fue en USD.</summary>
    public decimal? MontoMoneda { get; set; }

    /// <summary>Copia del tipo de cambio (NIO por USD) usado. Null si el pago fue en USD.</summary>
    public decimal? TipoCambioAplicado { get; set; }

    public MetodoPago MetodoPago { get; set; }

    /// <summary>Número de transferencia o voucher.</summary>
    public string? Referencia { get; set; }

    /// <summary>Si no se asigna, la BD pone la fecha actual.</summary>
    public DateTimeOffset Fecha { get; set; }

    public EstadoPago Estado { get; set; } = EstadoPago.Aplicado;
    public string? MotivoAnulacion { get; set; }
    public DateTimeOffset? AnuladoEn { get; set; }

    /// <summary>Quién registró el pago.</summary>
    public long UsuarioId { get; set; }

    public DateTimeOffset CreadoEn { get; private set; }
    public DateTimeOffset ActualizadoEn { get; private set; }

    public Factura Factura { get; set; } = null!;
    public Cliente Cliente { get; set; } = null!;
}
