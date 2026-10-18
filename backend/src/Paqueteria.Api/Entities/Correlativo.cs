namespace Paqueteria.Api.Entities;

/// <summary>
/// Contador sin huecos para números de factura y códigos de embarque. Lo maneja la BD
/// (fn_siguiente_correlativo); el backend solo lo lee.
/// </summary>
public class Correlativo
{
    /// <summary>Agencia dueña de la fila. La pone la BD (variable de sesión paqueteria.agencia_id); el código nunca la asigna.</summary>
    public long AgenciaId { get; private set; }

    /// <summary>'FAC', 'AIR-2026', 'SEA-2026'.</summary>
    public string Clave { get; private set; } = null!;

    public long UltimoValor { get; private set; }
    public DateTimeOffset ActualizadoEn { get; private set; }
}
