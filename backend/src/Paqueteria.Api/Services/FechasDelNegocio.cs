namespace Paqueteria.Api.Services;

public static class FechasDelNegocio
{
    /// <summary>Margen para relojes desfasados al validar que una fecha no sea futura.</summary>
    private static readonly TimeSpan ToleranciaReloj = TimeSpan.FromMinutes(5);

    /// <summary>
    /// Fecha de un hecho que se puede registrar después (salida, llegada, entrega): la indicada o
    /// ahora, en UTC (Npgsql rechaza otros offsets). Nunca futura.
    /// </summary>
    public static DateTimeOffset DelHecho(DateTimeOffset? fecha, DateTimeOffset ahora, string hecho)
    {
        var valor = (fecha ?? ahora).ToUniversalTime();
        if (valor > ahora + ToleranciaReloj)
        {
            throw new SolicitudInvalidaException($"La fecha de {hecho} no puede ser futura.");
        }
        return valor;
    }
}
