namespace Paqueteria.Api.Entities;

/// <summary>
/// Precio por unidad de un método de envío durante un período. Para obtener la vigente
/// usar fn_tarifa_vigente(metodo, fecha); nunca poner tarifas en el código.
/// </summary>
public class TarifaEnvio
{
    public int Id { get; set; }

    /// <summary>Agencia dueña de la fila. La pone la BD (variable de sesión paqueteria.agencia_id); el código nunca la asigna.</summary>
    public long AgenciaId { get; private set; }
    public short MetodoEnvioId { get; set; }
    public decimal PrecioPorUnidad { get; set; }
    public UnidadTarifa Unidad { get; set; } = UnidadTarifa.Lb;
    public Moneda Moneda { get; set; } = Moneda.Usd;
    public DateOnly FechaInicio { get; set; }

    /// <summary>Inclusiva. Vacía = vigente sin fin.</summary>
    public DateOnly? FechaFin { get; set; }

    public bool Activo { get; set; } = true;
    public long? CreadoPorUsuarioId { get; set; }
    public DateTimeOffset CreadoEn { get; private set; }
    public DateTimeOffset ActualizadoEn { get; private set; }

    public MetodoEnvio MetodoEnvio { get; set; } = null!;
}
