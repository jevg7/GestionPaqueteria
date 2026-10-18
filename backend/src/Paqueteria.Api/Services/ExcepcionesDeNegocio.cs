namespace Paqueteria.Api.Services;

/// <summary>
/// Una regla de negocio impide la operación. El manejador global la convierte en ProblemDetails
/// con el mensaje en <c>detail</c>: se muestra al usuario, así que se escribe para él y solo con
/// códigos (PKG-, CLI-, FAC-), nunca con nombres u otros datos personales.
/// </summary>
public abstract class ReglaDeNegocioException(string mensaje) : Exception(mensaje)
{
    public abstract int StatusCode { get; }
}

/// <summary>409: el estado actual de los datos no permite la operación.</summary>
public sealed class ConflictoException(string mensaje) : ReglaDeNegocioException(mensaje)
{
    public override int StatusCode => StatusCodes.Status409Conflict;
}

/// <summary>403: el rol permite la operación pero no sobre este registro (p. ej. la entrega de otro repartidor).</summary>
public sealed class AccesoDenegadoException(string mensaje) : ReglaDeNegocioException(mensaje)
{
    public override int StatusCode => StatusCodes.Status403Forbidden;
}

/// <summary>503: un servicio externo (Supabase Auth) no está configurado o no respondió.</summary>
public sealed class ServicioNoDisponibleException(string mensaje) : ReglaDeNegocioException(mensaje)
{
    public override int StatusCode => StatusCodes.Status503ServiceUnavailable;
}

/// <summary>400: la solicitud hace referencia a algo que no existe o no es válido.</summary>
public sealed class SolicitudInvalidaException(string mensaje) : ReglaDeNegocioException(mensaje)
{
    public override int StatusCode => StatusCodes.Status400BadRequest;
}
