namespace Paqueteria.Api.Entities;

/// <summary>
/// Un cambio de datos, registrado por el trigger fn_auditar (migración Auditoria). Solo lectura: la
/// escribe la BD y es inmutable. Captura todo cambio, venga de la API, de otro trigger o de SQL manual.
/// </summary>
public class AuditLog
{
    public long Id { get; private set; }

    /// <summary>Agencia del cambio. Vacía en cambios de la plataforma sin agencia.</summary>
    public long? AgenciaId { get; private set; }
    public DateTimeOffset Fecha { get; private set; }

    /// <summary>Usuario de la API que hizo el cambio. Vacío si el cambio no vino de la API (SQL manual, seed).</summary>
    public long? UsuarioId { get; private set; }

    public string Tabla { get; private set; } = null!;

    /// <summary>Clave primaria del registro (compuesta separada por comas, p. ej. usuario_roles "3,1").</summary>
    public string RegistroId { get; private set; } = null!;

    public AccionAuditoria Accion { get; private set; }

    /// <summary>JSON: en UPDATE solo las columnas que cambiaron; en DELETE la fila completa.</summary>
    public string? ValoresAnteriores { get; private set; }

    /// <summary>JSON: en UPDATE solo las columnas que cambiaron; en INSERT la fila completa.</summary>
    public string? ValoresNuevos { get; private set; }

    /// <summary>Solicitud HTTP que originó el cambio, p. ej. "POST /api/payments/12/void".</summary>
    public string? Origen { get; private set; }

    /// <summary>TraceId de la solicitud: permite cruzar con los logs.</summary>
    public string? TraceId { get; private set; }
}
