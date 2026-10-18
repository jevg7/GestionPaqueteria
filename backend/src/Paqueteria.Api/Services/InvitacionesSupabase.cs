using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Paqueteria.Api.Auth;

namespace Paqueteria.Api.Services;

/// <summary>
/// Invita usuarios con la API de administración de Supabase Auth: Supabase crea la cuenta y envía el
/// correo para que el invitado defina su contraseña. Devuelve el id de la cuenta (usuarios.auth_user_id).
/// Invitar de nuevo a quien aún no aceptó reenvía el correo y devuelve la misma cuenta.
/// </summary>
public sealed class InvitacionesSupabase(
    IHttpClientFactory httpClientFactory, IOptions<SupabaseAdminOptions> opciones, ILogger<InvitacionesSupabase> logger)
{
    public async Task<Guid> InvitarAsync(string correo, CancellationToken cancellationToken)
    {
        var config = opciones.Value;
        if (!config.Configurado)
        {
            logger.LogError("No se puede invitar: faltan Supabase:Url o Supabase:ServiceRoleKey.");
            throw new ServicioNoDisponibleException(
                "Las invitaciones por correo no están configuradas. Contacte al soporte de la plataforma.");
        }

        var url = $"{config.Url!.TrimEnd('/')}/auth/v1/invite";
        if (!string.IsNullOrWhiteSpace(config.InviteRedirectUrl))
        {
            url += "?redirect_to=" + Uri.EscapeDataString(config.InviteRedirectUrl);
        }
        using var solicitud = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = JsonContent.Create(new { email = correo }),
        };
        solicitud.Headers.Add("apikey", config.ServiceRoleKey);
        // Las claves nuevas (sb_secret_…) van solo en apikey; la service_role anterior es un JWT y
        // también se envía como Bearer.
        if (config.ServiceRoleKey!.StartsWith("eyJ", StringComparison.Ordinal))
        {
            solicitud.Headers.Authorization = new AuthenticationHeaderValue("Bearer", config.ServiceRoleKey);
        }

        HttpResponseMessage respuesta;
        try
        {
            respuesta = await httpClientFactory.CreateClient(SupabaseAdminOptions.HttpClient).SendAsync(solicitud, cancellationToken);
        }
        catch (Exception ex) when (ex is HttpRequestException || (ex is TaskCanceledException && !cancellationToken.IsCancellationRequested))
        {
            logger.LogError("Supabase Auth no respondió al invitar ({Tipo}).", ex.GetType().Name);
            throw NoDisponible();
        }

        using (respuesta)
        {
            if (respuesta.IsSuccessStatusCode)
            {
                var cuenta = await respuesta.Content.ReadFromJsonAsync<JsonElement>(cancellationToken);
                if (cuenta.ValueKind == JsonValueKind.Object && cuenta.TryGetProperty("id", out var id) && id.TryGetGuid(out var authUserId))
                {
                    return authUserId;
                }
                logger.LogError("Supabase Auth respondió la invitación sin el id de la cuenta.");
                throw NoDisponible();
            }

            // Solo el código de error: el cuerpo puede incluir el correo.
            var codigo = await CodigoDeErrorAsync(respuesta, cancellationToken);
            logger.LogWarning("Supabase Auth rechazó la invitación. HTTP: {Status}; código: {Codigo}.", (int)respuesta.StatusCode, codigo);
            throw (respuesta.StatusCode, codigo) switch
            {
                (HttpStatusCode.UnprocessableEntity, "email_exists" or "user_already_exists") => new ConflictoException(
                    "Ese correo ya tiene una cuenta activa en el sistema de acceso: la invitación ya fue aceptada."),
                (HttpStatusCode.UnprocessableEntity or HttpStatusCode.BadRequest, _) => new SolicitudInvalidaException(
                    "El sistema de acceso rechazó el correo. Revise que sea una dirección válida."),
                (HttpStatusCode.TooManyRequests, _) => new ServicioNoDisponibleException(
                    "Se alcanzó el límite de correos de invitación. Intente de nuevo en unos minutos."),
                _ => NoDisponible(),
            };
        }
    }

    private static ServicioNoDisponibleException NoDisponible() =>
        new("El sistema de acceso (Supabase) no está disponible. Intente de nuevo en unos minutos.");

    private static async Task<string?> CodigoDeErrorAsync(HttpResponseMessage respuesta, CancellationToken cancellationToken)
    {
        try
        {
            var error = await respuesta.Content.ReadFromJsonAsync<JsonElement>(cancellationToken);
            return error.ValueKind == JsonValueKind.Object && error.TryGetProperty("error_code", out var codigo)
                ? codigo.GetString()
                : null;
        }
        catch (Exception ex) when (ex is JsonException or NotSupportedException)
        {
            return null;
        }
    }
}
