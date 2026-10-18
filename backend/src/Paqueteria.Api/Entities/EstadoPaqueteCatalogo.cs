namespace Paqueteria.Api.Entities;

/// <summary>
/// Fila de la tabla estados_paquete (catálogo fijo del sistema). El backend trabaja con el
/// enum <see cref="EstadoPaquete"/>; esta entidad aporta el nombre, el orden y si es final.
/// </summary>
public class EstadoPaqueteCatalogo
{
    public EstadoPaquete Id { get; set; }
    public string Codigo { get; set; } = null!;
    public string Nombre { get; set; } = null!;
    public string? Descripcion { get; set; }
    public short Orden { get; set; }

    /// <summary>Un paquete en estado final no puede cambiar de estado.</summary>
    public bool EsFinal { get; set; }
}
