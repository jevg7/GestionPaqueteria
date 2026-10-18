namespace Paqueteria.Api.Entities;

/// <summary>
/// Córdobas por dólar de un día, registrado por el administrador. Un pago en córdobas usa el
/// vigente (el más reciente con fecha ≤ hoy en Managua) y guarda una copia en
/// <see cref="Pago.TipoCambioAplicado"/>: corregir esta tabla no altera pagos ya registrados.
/// </summary>
public class TipoCambio
{
    public int Id { get; set; }

    /// <summary>Agencia dueña de la fila. La pone la BD (variable de sesión paqueteria.agencia_id); el código nunca la asigna.</summary>
    public long AgenciaId { get; private set; }

    /// <summary>Día al que corresponde. Uno por día.</summary>
    public DateOnly Fecha { get; set; }

    /// <summary>Córdobas (NIO) por 1 dólar (USD).</summary>
    public decimal NioPorUsd { get; set; }

    public long CreadoPorUsuarioId { get; set; }
    public DateTimeOffset CreadoEn { get; private set; }
    public DateTimeOffset ActualizadoEn { get; private set; }
}
