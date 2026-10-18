namespace Paqueteria.Api.Entities;

public class Rol
{
    public short Id { get; set; }

    /// <summary>ADMIN, AGENTE, BODEGA, REPARTIDOR.</summary>
    public string Codigo { get; set; } = null!;

    public string Nombre { get; set; } = null!;
    public string? Descripcion { get; set; }
    public bool Activo { get; set; } = true;

    public ICollection<UsuarioRol> Usuarios { get; } = [];
}
