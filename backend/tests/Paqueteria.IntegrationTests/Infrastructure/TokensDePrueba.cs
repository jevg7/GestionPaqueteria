using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Paqueteria.IntegrationTests.Infrastructure;

/// <summary>
/// Hace el papel de Supabase Auth: una clave ES256 (la que usa Supabase con claves asimétricas),
/// su JWKS público y tokens con la forma de los de Supabase.
/// </summary>
public static class TokensDePrueba
{
    public const string Issuer = "https://auth.paqueteria.test/auth/v1";
    public const string JwksUrl = Issuer + "/.well-known/jwks.json";
    public const string Audience = "authenticated";

    public static ECDsaSecurityKey Clave { get; } = NuevaClave("clave-prueba-1");

    /// <summary>Documento JWKS con solo la parte pública de <see cref="Clave"/>.</summary>
    public static string Jwks { get; } = CrearJwks(Clave);

    public static ECDsaSecurityKey NuevaClave(string kid) =>
        new(ECDsa.Create(ECCurve.NamedCurves.nistP256)) { KeyId = kid };

    public static string Crear(
        Guid sub,
        string issuer = Issuer,
        string audience = Audience,
        DateTime? expira = null,
        SigningCredentials? firma = null,
        IDictionary<string, object>? claimsExtra = null)
    {
        var vence = expira ?? DateTime.UtcNow.AddHours(1);
        var emitido = vence < DateTime.UtcNow ? vence.AddHours(-1) : DateTime.UtcNow;
        var claims = new Dictionary<string, object>
        {
            ["sub"] = sub.ToString(),
            ["role"] = "authenticated",
            ["email"] = "empleado@paqueteria.test",
        };
        foreach (var (tipo, valor) in claimsExtra ?? new Dictionary<string, object>())
        {
            claims[tipo] = valor;
        }

        return new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = issuer,
            Audience = audience,
            IssuedAt = emitido,
            NotBefore = emitido,
            Expires = vence,
            Claims = claims,
            SigningCredentials = firma ?? new SigningCredentials(Clave, SecurityAlgorithms.EcdsaSha256),
        });
    }

    /// <summary>Firma HS256 con un secreto cualquiera: la API solo acepta algoritmos asimétricos.</summary>
    public static SigningCredentials FirmaHs256() =>
        new(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(new string('s', 64))), SecurityAlgorithms.HmacSha256);

    private static string CrearJwks(ECDsaSecurityKey clave)
    {
        var publica = clave.ECDsa.ExportParameters(includePrivateParameters: false);
        return $$"""
            {"keys":[{"kty":"EC","crv":"P-256","alg":"ES256","use":"sig","kid":"{{clave.KeyId}}",
            "x":"{{Base64UrlEncoder.Encode(publica.Q.X!)}}","y":"{{Base64UrlEncoder.Encode(publica.Q.Y!)}}"}]}
            """;
    }
}

/// <summary>Responde el JWKS de prueba en lugar de ir a Supabase.</summary>
public sealed class JwksDePrueba : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
        Task.FromResult(request.RequestUri?.AbsoluteUri == TokensDePrueba.JwksUrl
            ? new HttpResponseMessage(System.Net.HttpStatusCode.OK)
            {
                Content = new StringContent(TokensDePrueba.Jwks, Encoding.UTF8, "application/json"),
            }
            : new HttpResponseMessage(System.Net.HttpStatusCode.NotFound));
}
