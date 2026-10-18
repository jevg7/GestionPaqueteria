namespace Paqueteria.Api.Entities;

public class MetodoEnvio
{
    public short Id { get; set; }

    /// <summary>AEREO, MARITIMO.</summary>
    public string Codigo { get; set; } = null!;

    public string Nombre { get; set; } = null!;

    /// <summary>AIR, SEA. Se usa en el código del embarque.</summary>
    public string PrefijoEmbarque { get; set; } = null!;

    public string? Descripcion { get; set; }
    public bool Activo { get; set; } = true;
    public DateTimeOffset CreadoEn { get; private set; }
    public DateTimeOffset ActualizadoEn { get; private set; }
}
