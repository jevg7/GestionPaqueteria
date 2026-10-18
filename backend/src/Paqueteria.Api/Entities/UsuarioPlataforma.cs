namespace Paqueteria.Api.Entities;

/// <summary>
/// Dueño de la plataforma: administra agencias (crear, suspender). No pertenece a ninguna agencia y
/// no ve datos de negocio. El primero se crea al iniciar sesión con un correo de la configuración
/// Plataforma:Propietarios.
/// </summary>
public class UsuarioPlataforma
{
    public long Id { get; set; }
    public Guid? AuthUserId { get; set; }
    public string Nombres { get; set; } = null!;
    public string Apellidos { get; set; } = null!;
    public string Correo { get; set; } = null!;
    public bool Activo { get; set; } = true;
    public DateTimeOffset CreadoEn { get; private set; }
    public DateTimeOffset ActualizadoEn { get; private set; }
}
