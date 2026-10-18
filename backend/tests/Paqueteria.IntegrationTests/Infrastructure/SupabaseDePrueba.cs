using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace Paqueteria.IntegrationTests.Infrastructure;

/// <summary>
/// Hace el papel de la API de administración de Supabase Auth: registra las invitaciones y responde
/// como Supabase (misma cuenta al reinvitar a quien no aceptó; 422 email_exists si ya aceptó).
/// </summary>
public sealed class SupabaseDePrueba
{
    public const string Url = "https://supabase.paqueteria.test";
    public const string Clave = "sb_secret_clave-de-prueba";
    public const string RedirectUrl = "https://app.paqueteria.test/aceptar-invitacion";

    private readonly ConcurrentDictionary<string, Guid> cuentas = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>Invitaciones recibidas, en orden.</summary>
    public ConcurrentQueue<Invitacion> Invitaciones { get; } = new();

    /// <summary>Si tiene valor, Supabase responde este estado a toda invitación (con este error_code).</summary>
    public (HttpStatusCode Estado, string? Codigo)? Falla { get; set; }

    /// <summary>Correos de cuentas que ya aceptaron la invitación.</summary>
    public ConcurrentDictionary<string, bool> Confirmadas { get; } = new(StringComparer.OrdinalIgnoreCase);

    public Guid CuentaDe(string correo) => cuentas[correo];

    public HttpMessageHandler Handler() => new Manejador(this);

    public sealed record Invitacion(string Correo, Guid AuthUserId, string? RedirectTo, string? ApiKey, string? Authorization);

    private sealed class Manejador(SupabaseDePrueba supabase) : HttpMessageHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            if (request.Method != HttpMethod.Post || request.RequestUri?.GetLeftPart(UriPartial.Path) != Url + "/auth/v1/invite")
            {
                return new HttpResponseMessage(HttpStatusCode.NotFound);
            }
            if (supabase.Falla is { } falla)
            {
                return Json(falla.Estado, new { code = (int)falla.Estado, error_code = falla.Codigo, msg = "falla simulada" });
            }

            var cuerpo = await request.Content!.ReadFromJsonAsync<JsonElement>(cancellationToken);
            var correo = cuerpo.GetProperty("email").GetString()!;
            if (supabase.Confirmadas.ContainsKey(correo))
            {
                return Json(HttpStatusCode.UnprocessableEntity, new { code = 422, error_code = "email_exists", msg = "ya registrado" });
            }

            var id = supabase.cuentas.GetOrAdd(correo, _ => Guid.NewGuid());
            var query = System.Web.HttpUtility.ParseQueryString(request.RequestUri!.Query);
            supabase.Invitaciones.Enqueue(new Invitacion(correo, id, query["redirect_to"],
                request.Headers.TryGetValues("apikey", out var claves) ? claves.Single() : null,
                request.Headers.Authorization?.ToString()));
            return Json(HttpStatusCode.OK, new { id, email = correo, aud = "authenticated", role = "authenticated" });
        }

        private static HttpResponseMessage Json(HttpStatusCode estado, object cuerpo) =>
            new(estado) { Content = new StringContent(JsonSerializer.Serialize(cuerpo), Encoding.UTF8, "application/json") };
    }
}
