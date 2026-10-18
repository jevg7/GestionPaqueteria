namespace Paqueteria.Api.Entities;

public class Ubicacion
{
    public int Id { get; set; }

    /// <summary>Agencia dueña de la fila. La pone la BD (variable de sesión paqueteria.agencia_id); el código nunca la asigna.</summary>
    public long AgenciaId { get; private set; }

    /// <summary>MIA, MGA.</summary>
    public string Codigo { get; set; } = null!;

    public string Nombre { get; set; } = null!;

    /// <summary>ISO 3166-1 alfa-2: US, NI.</summary>
    public string Pais { get; set; } = null!;

    public bool Activo { get; set; } = true;
}
