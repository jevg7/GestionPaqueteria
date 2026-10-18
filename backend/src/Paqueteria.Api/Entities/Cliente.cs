namespace Paqueteria.Api.Entities;

/// <summary>Persona que envía paquetes a través de la agencia.</summary>
public class Cliente
{
    public long Id { get; set; }

    /// <summary>Agencia dueña de la fila. La pone la BD (variable de sesión paqueteria.agencia_id); el código nunca la asigna.</summary>
    public long AgenciaId { get; private set; }

    /// <summary>CLI-000001. Lo genera la BD.</summary>
    public string CodigoCliente { get; private set; } = null!;

    public string Nombres { get; set; } = null!;
    public string Apellidos { get; set; } = null!;

    /// <summary>Obligatorio: es el canal para notificar.</summary>
    public string Telefono { get; set; } = null!;

    public string? Correo { get; set; }

    /// <summary>Dirección habitual (la de cada delivery se guarda en la entrega).</summary>
    public string? Direccion { get; set; }

    public bool Activo { get; set; } = true;

    /// <summary>Si no se asigna, la BD pone la fecha actual.</summary>
    public DateTimeOffset FechaRegistro { get; set; }

    public DateTimeOffset ActualizadoEn { get; private set; }
}
