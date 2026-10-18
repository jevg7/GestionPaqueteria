namespace Paqueteria.Api.Entities;

/// <summary>Un paquete de un cliente, desde que se registra hasta que se entrega.</summary>
/// <remarks>
/// El estado actual y las fechas de recepción los produce la BD: para cambiar de estado
/// se agrega un <see cref="HistorialEstadoPaquete"/> y después se recarga el paquete.
/// Un paquete nuevo nace en <see cref="EstadoPaquete.Registrado"/>, sin embarque ni cálculo.
/// </remarks>
public class Paquete
{
    public long Id { get; set; }

    /// <summary>Agencia dueña de la fila. La pone la BD (variable de sesión paqueteria.agencia_id); el código nunca la asigna.</summary>
    public long AgenciaId { get; private set; }

    /// <summary>PKG-000001. Lo genera la BD.</summary>
    public string CodigoPaquete { get; private set; } = null!;

    public long ClienteId { get; set; }

    /// <summary>Tracking de Amazon/courier. Único entre paquetes no cancelados.</summary>
    public string? TrackingExterno { get; set; }

    public string? Tienda { get; set; }
    public string Descripcion { get; set; } = null!;
    public short MetodoEnvioId { get; set; }

    /// <summary>Copia del último estado del historial. Solo lectura.</summary>
    public EstadoPaquete EstadoActualId { get; private set; }

    /// <summary>Debe ser un embarque del mismo método de envío.</summary>
    public long? EmbarqueId { get; set; }

    /// <summary>Peso en libras. Se registra en Nicaragua.</summary>
    public decimal? PesoLb { get; set; }

    /// <summary>Debe ser una tarifa del mismo método. Tarifa, tarifa aplicada y monto van juntos.</summary>
    public int? TarifaId { get; set; }

    /// <summary>Copia del precio por libra al calcular.</summary>
    public decimal? TarifaAplicada { get; set; }

    public decimal? MontoCalculado { get; set; }
    public long RegistradoPorUsuarioId { get; set; }

    /// <summary>Si no se asigna, la BD pone la fecha actual.</summary>
    public DateTimeOffset FechaRegistro { get; set; }

    /// <summary>La llena el historial al pasar a RECIBIDO_EN_MIAMI. Solo lectura.</summary>
    public DateTimeOffset? FechaRecepcionMiami { get; private set; }

    /// <summary>La llena el historial al pasar a RECIBIDO_EN_NICARAGUA. Solo lectura.</summary>
    public DateTimeOffset? FechaRecepcionNicaragua { get; private set; }

    public DateTimeOffset ActualizadoEn { get; private set; }

    public Cliente Cliente { get; set; } = null!;
    public MetodoEnvio MetodoEnvio { get; set; } = null!;
    public EstadoPaqueteCatalogo EstadoActual { get; private set; } = null!;
    public Embarque? Embarque { get; set; }
    public TarifaEnvio? Tarifa { get; set; }
    public ICollection<HistorialEstadoPaquete> Historial { get; } = [];
}
