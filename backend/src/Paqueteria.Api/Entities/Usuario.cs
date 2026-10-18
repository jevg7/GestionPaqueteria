namespace Paqueteria.Api.Entities;

/// <summary>Empleado con acceso al sistema. La autenticación la maneja Supabase Auth.</summary>
public class Usuario
{
    public long Id { get; set; }

    /// <summary>Agencia dueña de la fila. La pone la BD (variable de sesión paqueteria.agencia_id); el código nunca la asigna.</summary>
    public long AgenciaId { get; private set; }

    /// <summary>Claim "sub" del JWT de Supabase: el id de la cuenta que se crea al invitarlo.</summary>
    public Guid? AuthUserId { get; set; }

    public string Nombres { get; set; } = null!;
    public string Apellidos { get; set; } = null!;
    public string Correo { get; set; } = null!;
    public string? Telefono { get; set; }

    /// <summary>Un usuario inactivo no debe poder operar aunque su token sea válido.</summary>
    public bool Activo { get; set; } = true;

    public DateTimeOffset CreadoEn { get; private set; }
    public DateTimeOffset ActualizadoEn { get; private set; }

    public ICollection<UsuarioRol> Roles { get; } = [];
}
