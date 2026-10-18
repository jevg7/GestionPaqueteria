using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;
using Paqueteria.Api.Auth;
using Paqueteria.Api.DTOs;
using Paqueteria.Api.Entities;
using Paqueteria.IntegrationTests.Infrastructure;

namespace Paqueteria.IntegrationTests;

/// <summary>JWT de Supabase (simulado con una clave ES256 propia) + usuario activo en la BD.</summary>
public class AutenticacionTests(ServidorPostgres servidor) : PruebaHttpConBaseDeDatos(servidor)
{
    public enum TokenInvalido { FirmaDeOtraClave, EmisorDistinto, AudienciaDistinta, Expirado, Hs256 }

    [Fact]
    public async Task SinTokenResponde401()
    {
        var api = Api;
        using var client = api.Client();

        using var response = await client.GetAsync("/api/me", Ct);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task UsuarioActivoObtieneSusDatosYSusRolesActivos()
    {
        var (usuario, authUserId) = await CrearEmpleadoAsync(roles: [CodigosRol.Bodega, CodigosRol.Agente, CodigosRol.Repartidor]);
        await using (var db = NuevoContexto())
        {
            // Un rol desactivado deja de contar para todos sus usuarios.
            await db.Roles.Where(r => r.Codigo == CodigosRol.Repartidor)
                .ExecuteUpdateAsync(s => s.SetProperty(r => r.Activo, false), Ct);
        }
        var api = Api;
        using var client = api.Client(TokensDePrueba.Crear(authUserId));

        var yo = await client.GetFromJsonAsync<CurrentUserResponse>("/api/me", JsonApi.Opciones, Ct);

        Assert.NotNull(yo);
        Assert.Equal(usuario.Id, yo.Id);
        Assert.Equal(usuario.Correo, yo.Correo);
        Assert.Equal([CodigosRol.Agente, CodigosRol.Bodega], yo.Roles);
        Assert.Equal("AGENCIA", yo.Tipo);
        Assert.Equal(new AgencyRef(BaseDeDatosDePrueba.AgenciaDeEjemplo, "Agencia de ejemplo", EstadoAgencia.Activa), yo.Agencia);
    }

    [Theory]
    [InlineData(TokenInvalido.FirmaDeOtraClave)]
    [InlineData(TokenInvalido.EmisorDistinto)]
    [InlineData(TokenInvalido.AudienciaDistinta)]
    [InlineData(TokenInvalido.Expirado)]
    [InlineData(TokenInvalido.Hs256)]
    public async Task TokenInvalidoResponde401(TokenInvalido caso)
    {
        var (_, authUserId) = await CrearEmpleadoAsync(roles: [CodigosRol.Admin]);
        var token = caso switch
        {
            TokenInvalido.FirmaDeOtraClave => TokensDePrueba.Crear(authUserId,
                firma: new SigningCredentials(TokensDePrueba.NuevaClave(TokensDePrueba.Clave.KeyId), SecurityAlgorithms.EcdsaSha256)),
            TokenInvalido.EmisorDistinto => TokensDePrueba.Crear(authUserId, issuer: "https://otro.supabase.co/auth/v1"),
            TokenInvalido.AudienciaDistinta => TokensDePrueba.Crear(authUserId, audience: "anon"),
            TokenInvalido.Expirado => TokensDePrueba.Crear(authUserId, expira: DateTime.UtcNow.AddMinutes(-10)),
            TokenInvalido.Hs256 => TokensDePrueba.Crear(authUserId, firma: TokensDePrueba.FirmaHs256()),
            _ => throw new ArgumentOutOfRangeException(nameof(caso)),
        };
        var api = Api;
        using var client = api.Client(token);

        using var response = await client.GetAsync("/api/me", Ct);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task TokenValidoDeAlguienQueNoEsEmpleadoResponde403()
    {
        var api = Api;
        using var client = api.Client(TokensDePrueba.Crear(Guid.NewGuid()));

        using var response = await client.GetAsync("/api/me", Ct);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Contains(api.Logs.Entries, e => e.Level == LogLevel.Warning && e.Text.Contains("sin acceso (SIN_CUENTA)"));
    }

    [Fact]
    public async Task UsuarioInactivoResponde403AunqueSuTokenSeaValido()
    {
        var (_, authUserId) = await CrearEmpleadoAsync(activo: false, roles: [CodigosRol.Admin]);
        var api = Api;
        using var client = api.Client(TokensDePrueba.Crear(authUserId));

        using var response = await client.GetAsync("/api/me", Ct);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task QuitarUnRolSurteEfectoConElMismoToken()
    {
        var (usuario, authUserId) = await CrearEmpleadoAsync(roles: [CodigosRol.Admin]);
        var api = Api;
        using var client = api.Client(TokensDePrueba.Crear(authUserId));

        using (var antes = await client.GetAsync("/__test/roles/admin", Ct))
        {
            Assert.Equal(HttpStatusCode.OK, antes.StatusCode);
            Assert.Equal(usuario.Id.ToString(), await antes.Content.ReadAsStringAsync(Ct));
        }

        await using (var db = NuevoContexto())
        {
            // usuario_roles es la única tabla en la que la API puede borrar.
            await db.UsuarioRoles.Where(ur => ur.UsuarioId == usuario.Id).ExecuteDeleteAsync(Ct);
        }

        using var despues = await client.GetAsync("/__test/roles/admin", Ct);
        Assert.Equal(HttpStatusCode.Forbidden, despues.StatusCode);
    }

    [Fact]
    public async Task ClaimsDeLaApiDentroDelTokenSeIgnoran()
    {
        var (_, authUserId) = await CrearEmpleadoAsync(roles: [CodigosRol.Bodega]);
        var token = TokensDePrueba.Crear(authUserId, claimsExtra: new Dictionary<string, object>
        {
            [ClaimsPaqueteria.Rol] = CodigosRol.Admin,
            [ClaimsPaqueteria.UsuarioId] = "1",
        });
        var api = Api;
        using var client = api.Client(token);

        using var response = await client.GetAsync("/__test/roles/admin", Ct);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task BaseDeDatosInaccesibleConTokenValidoResponde503()
    {
        // Sin BD no se puede saber si el usuario está activo: no es 401 ni 403, es 503.
        await using var api = new ApiDePrueba();
        using var client = api.Client(TokensDePrueba.Crear(Guid.NewGuid()));

        using var response = await client.GetAsync("/api/me", Ct);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }

}

// Solo existe en el host de tests: comprueba que [Authorize(Roles)] usa los roles de la BD.
[ApiController]
[Route("__test/roles")]
public sealed class RoleProbeController(UsuarioActual usuarioActual) : ControllerBase
{
    [HttpGet("admin")]
    [Authorize(Roles = CodigosRol.Admin)]
    public string Admin() => usuarioActual.Id.ToString();
}
