namespace Paqueteria.Api.Entities;

/// <summary>
/// Cada cambio de estado de un paquete. Es la fuente de verdad del estado: al insertar,
/// un trigger actualiza <see cref="Paquete.EstadoActualId"/> y las fechas de recepción.
/// Inmutable: solo se inserta.
/// </summary>
public class HistorialEstadoPaquete
{
    public long Id { get; set; }

    /// <summary>Agencia dueña de la fila. La pone la BD (variable de sesión paqueteria.agencia_id); el código nunca la asigna.</summary>
    public long AgenciaId { get; private set; }
    public long PaqueteId { get; set; }

    /// <summary>Estado al que pasa el paquete.</summary>
    public EstadoPaquete EstadoId { get; set; }

    /// <summary>Quién hizo el cambio.</summary>
    public long UsuarioId { get; set; }

    /// <summary>Si no se asigna, la BD pone la fecha actual.</summary>
    public DateTimeOffset Fecha { get; set; }

    /// <summary>Ej.: "Entrega fallida: nadie en casa".</summary>
    public string? Observacion { get; set; }

    public Paquete Paquete { get; set; } = null!;
    public EstadoPaqueteCatalogo Estado { get; set; } = null!;
}
