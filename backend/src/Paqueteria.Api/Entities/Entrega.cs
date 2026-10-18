namespace Paqueteria.Api.Entities;

/// <summary>Un intento de entrega de un paquete. Como máximo uno vigente por paquete.</summary>
public class Entrega
{
    public long Id { get; set; }

    /// <summary>Agencia dueña de la fila. La pone la BD (variable de sesión paqueteria.agencia_id); el código nunca la asigna.</summary>
    public long AgenciaId { get; private set; }
    public long PaqueteId { get; set; }
    public TipoEntrega TipoEntrega { get; set; }

    /// <summary>Obligatoria para DELIVERY.</summary>
    public string? Direccion { get; set; }

    public EstadoEntrega Estado { get; set; } = EstadoEntrega.Pendiente;
    public DateTimeOffset? FechaProgramada { get; set; }

    /// <summary>Obligatoria en ENTREGADA.</summary>
    public DateTimeOffset? FechaEntrega { get; set; }

    /// <summary>Obligatoria en ENTREGADA.</summary>
    public string? PersonaRecibe { get; set; }

    /// <summary>Repartidor asignado. Obligatorio en EN_RUTA.</summary>
    public long? ResponsableUsuarioId { get; set; }

    public string? Observaciones { get; set; }
    public long CreadoPorUsuarioId { get; set; }
    public DateTimeOffset CreadoEn { get; private set; }
    public DateTimeOffset ActualizadoEn { get; private set; }

    public Paquete Paquete { get; set; } = null!;
    public Usuario? Responsable { get; set; }
}
