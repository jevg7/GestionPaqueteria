namespace Paqueteria.Api.Auth;

/// <summary>
/// Sección <c>Auth</c> de la configuración. No contiene secretos: con claves asimétricas la API
/// solo necesita saber quién emite los tokens y dónde están sus claves públicas (JWKS).
/// </summary>
public sealed class SupabaseAuthOptions
{
    public const string Seccion = "Auth";

    /// <summary>Nombre del HttpClient que descarga el JWKS.</summary>
    public const string JwksHttpClient = "SupabaseJwks";

    /// <summary>Emisor de los tokens: <c>https://&lt;proyecto&gt;.supabase.co/auth/v1</c>.</summary>
    public string? Issuer { get; set; }

    /// <summary>Audiencia de los tokens de usuarios con sesión en Supabase.</summary>
    public string Audience { get; set; } = "authenticated";

    /// <summary>Opcional. Por defecto <c>{Issuer}/.well-known/jwks.json</c>.</summary>
    public string? JwksUrl { get; set; }

    public bool Configurado => !string.IsNullOrWhiteSpace(Issuer);

    public string JwksUrlEfectiva =>
        string.IsNullOrWhiteSpace(JwksUrl) ? $"{Issuer?.TrimEnd('/')}/.well-known/jwks.json" : JwksUrl;

    /// <summary>Error de configuración, o null si es válida (o si no está configurado).</summary>
    public string? Validar()
    {
        if (!Configurado)
        {
            return null;
        }
        if (!EsHttps(Issuer) || !EsHttps(JwksUrlEfectiva))
        {
            return "Auth:Issuer y Auth:JwksUrl deben ser URL absolutas HTTPS.";
        }
        return string.IsNullOrWhiteSpace(Audience) ? "Auth:Audience no puede estar vacío." : null;
    }

    private static bool EsHttps(string? valor) =>
        Uri.TryCreate(valor, UriKind.Absolute, out var uri) && uri.Scheme == Uri.UriSchemeHttps;
}
