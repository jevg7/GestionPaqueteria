namespace Paqueteria.Api.Auth;

/// <summary>
/// Sección <c>Supabase</c>: acceso de administración a Supabase Auth para invitar usuarios.
/// <see cref="ServiceRoleKey"/> es un secreto: solo en user-secrets o en la variable de entorno
/// <c>Supabase__ServiceRoleKey</c>, nunca en appsettings ni en el repositorio.
/// </summary>
public sealed class SupabaseAdminOptions
{
    public const string Seccion = "Supabase";

    /// <summary>Nombre del HttpClient de la API de administración de Supabase Auth.</summary>
    public const string HttpClient = "SupabaseAdmin";

    /// <summary>URL del proyecto: <c>https://&lt;proyecto&gt;.supabase.co</c>.</summary>
    public string? Url { get; set; }

    /// <summary>Clave secreta (<c>sb_secret_…</c>) o la service_role (JWT) de proyectos anteriores.</summary>
    public string? ServiceRoleKey { get; set; }

    /// <summary>Página del frontend donde el invitado crea su contraseña. Debe estar en las Redirect URLs de Supabase.</summary>
    public string? InviteRedirectUrl { get; set; }

    public bool Configurado => !string.IsNullOrWhiteSpace(Url) && !string.IsNullOrWhiteSpace(ServiceRoleKey);

    /// <summary>Error de configuración, o null si es válida (o si no está configurado).</summary>
    public string? Validar()
    {
        if (string.IsNullOrWhiteSpace(Url) && string.IsNullOrWhiteSpace(ServiceRoleKey))
        {
            return null;
        }
        if (!Configurado)
        {
            return "Supabase:Url y Supabase:ServiceRoleKey se configuran juntos.";
        }
        if (!EsSegura(Url) || (!string.IsNullOrWhiteSpace(InviteRedirectUrl) && !EsSegura(InviteRedirectUrl)))
        {
            return "Supabase:Url y Supabase:InviteRedirectUrl deben ser URL absolutas HTTPS (HTTP solo en localhost).";
        }
        return null;
    }

    // Supabase local (supabase start) escucha en http://127.0.0.1:54321.
    private static bool EsSegura(string? valor) =>
        Uri.TryCreate(valor, UriKind.Absolute, out var uri) &&
        (uri.Scheme == Uri.UriSchemeHttps || (uri.Scheme == Uri.UriSchemeHttp && uri.IsLoopback));
}
