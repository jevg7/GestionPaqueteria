namespace Paqueteria.Api.Entities;

/// <summary>Relación N:M Usuario-Rol. Única tabla en la que la API puede borrar.</summary>
public class UsuarioRol
{
    public long UsuarioId { get; set; }
    public short RolId { get; set; }

    /// <summary>Agencia dueña de la fila. La pone la BD (variable de sesión paqueteria.agencia_id); el código nunca la asigna.</summary>
    public long AgenciaId { get; private set; }

    /// <summary>Si no se asigna, la BD pone la fecha actual.</summary>
    public DateTimeOffset AsignadoEn { get; set; }

    public Usuario Usuario { get; set; } = null!;
    public Rol Rol { get; set; } = null!;
}
