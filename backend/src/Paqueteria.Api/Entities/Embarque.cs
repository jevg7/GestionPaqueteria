namespace Paqueteria.Api.Entities;

/// <summary>Agrupa paquetes que viajan juntos por la misma ruta y método.</summary>
public class Embarque
{
    public long Id { get; set; }

    /// <summary>Agencia dueña de la fila. La pone la BD (variable de sesión paqueteria.agencia_id); el código nunca la asigna.</summary>
    public long AgenciaId { get; private set; }

    /// <summary>AIR-2026-0001 / SEA-2026-0001. Lo asigna un trigger de la BD.</summary>
    public string CodigoEmbarque { get; private set; } = null!;

    public int RutaId { get; set; }

    /// <summary>No cambia después de crear el embarque (forma parte de la FK de sus paquetes).</summary>
    public short MetodoEnvioId { get; set; }

    public EstadoEmbarque Estado { get; set; } = EstadoEmbarque.Abierto;

    /// <summary>Obligatoria en EN_TRANSITO y RECIBIDO.</summary>
    public DateTimeOffset? FechaSalida { get; set; }

    public DateOnly? FechaLlegadaEstimada { get; set; }

    /// <summary>Obligatoria en RECIBIDO; no puede ser anterior a la salida.</summary>
    public DateTimeOffset? FechaLlegadaReal { get; set; }

    public string? Observaciones { get; set; }
    public long CreadoPorUsuarioId { get; set; }
    public DateTimeOffset CreadoEn { get; private set; }
    public DateTimeOffset ActualizadoEn { get; private set; }

    public Ruta Ruta { get; set; } = null!;
    public MetodoEnvio MetodoEnvio { get; set; } = null!;
    public ICollection<Paquete> Paquetes { get; } = [];
}
