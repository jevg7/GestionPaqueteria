using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace Paqueteria.Api.Auth;

/// <summary>
/// Descarga el JWKS de Supabase y lo entrega como configuración de JwtBearer. Así se reutiliza
/// el ConfigurationManager estándar: caché, refresco periódico y refresco al ver un "kid" nuevo
/// (rotación de claves en Supabase).
/// </summary>
internal sealed class JwksRetriever(string issuer) : IConfigurationRetriever<OpenIdConnectConfiguration>
{
    public async Task<OpenIdConnectConfiguration> GetConfigurationAsync(
        string address, IDocumentRetriever retriever, CancellationToken cancel)
    {
        var json = await retriever.GetDocumentAsync(address, cancel);
        var jwks = new JsonWebKeySet(json);
        var configuracion = new OpenIdConnectConfiguration { Issuer = issuer, JsonWebKeySet = jwks };
        foreach (var clave in jwks.GetSigningKeys())
        {
            configuracion.SigningKeys.Add(clave);
        }
        return configuracion;
    }
}
