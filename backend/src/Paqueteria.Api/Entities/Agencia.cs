namespace Paqueteria.Api.Entities;

/// <summary>
/// Agencia de envíos que usa la plataforma (SaaS). Cada una ve solo sus datos: lo garantiza RLS en la
/// BD. La crea y suspende el dueño de la plataforma.
/// </summary>
public class Agencia
{
    public long Id { get; set; }
    public string Nombre { get; set; } = null!;
    public string? Ruc { get; set; }
    public string? CorreoContacto { get; set; }
    public string? Telefono { get; set; }

    /// <summary>Una agencia suspendida no puede operar: sus usuarios reciben 403.</summary>
    public EstadoAgencia Estado { get; set; } = EstadoAgencia.Activa;

    public DateTimeOffset CreadoEn { get; private set; }
    public DateTimeOffset ActualizadoEn { get; private set; }
}
