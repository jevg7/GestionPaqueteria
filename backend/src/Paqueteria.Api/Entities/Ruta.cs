namespace Paqueteria.Api.Entities;

public class Ruta
{
    public int Id { get; set; }

    /// <summary>Agencia dueña de la fila. La pone la BD (variable de sesión paqueteria.agencia_id); el código nunca la asigna.</summary>
    public long AgenciaId { get; private set; }
    public int OrigenId { get; set; }
    public int DestinoId { get; set; }
    public string Nombre { get; set; } = null!;
    public bool Activo { get; set; } = true;

    public Ubicacion Origen { get; set; } = null!;
    public Ubicacion Destino { get; set; } = null!;
}
