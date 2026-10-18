using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Paqueteria.Api.Auth;
using Paqueteria.Api.DTOs;
using Paqueteria.Api.Entities;
using Paqueteria.IntegrationTests.Infrastructure;

namespace Paqueteria.IntegrationTests;

/// <summary>
/// SaaS por HTTP: cada agencia ve solo sus datos, una agencia suspendida no opera y el dueño de la
/// plataforma no ve datos de negocio. El aislamiento lo hace RLS; aquí se comprueba que la API fija la
/// agencia correcta en cada solicitud.
/// </summary>
public class AgenciasAislamientoTests(ServidorPostgres servidor) : PruebaHttpConBaseDeDatos(servidor)
{
    private const string CorreoPropietario = "duena@plataforma.test";

    [Fact]
    public async Task ClienteDeOtraAgenciaNoExisteParaLaApi()
    {
        using var agenteA = await ComoAsync(CodigosRol.Agente);
        var agenciaB = await CrearAgenciaAsync("Envíos B");
        using var agenteB = await ComoEnAgenciaAsync(agenciaB, CodigosRol.Agente);

        var clienteA = await Crear(agenteA);

        using (var get = await agenteB.GetAsync($"/api/clients/{clienteA.Id}", Ct))
        {
            Assert.Equal(HttpStatusCode.NotFound, get.StatusCode);
        }
        using (var put = await agenteB.PutAsJsonAsync($"/api/clients/{clienteA.Id}", Datos("Intruso"), Ct))
        {
            Assert.Equal(HttpStatusCode.NotFound, put.StatusCode);
        }
        using (var paquete = await agenteB.PostAsJsonAsync("/api/packages",
            new { clienteId = clienteA.Id, metodoEnvio = "AEREO", descripcion = "Audífonos" }, Ct))
        {
            await AssertProblema(paquete, HttpStatusCode.BadRequest, $"El cliente {clienteA.Id} no existe.");
        }
        var listaB = await agenteB.GetFromJsonAsync<PagedResponse<ClientResponse>>("/api/clients", JsonApi.Opciones, Ct);
        Assert.Empty(listaB!.Items);

        // Los correlativos son por agencia: B también empieza en CLI-000001.
        var clienteB = await Crear(agenteB);
        Assert.Equal("CLI-000001", clienteA.CodigoCliente);
        Assert.Equal("CLI-000001", clienteB.CodigoCliente);

        var listaA = await agenteA.GetFromJsonAsync<PagedResponse<ClientResponse>>("/api/clients", JsonApi.Opciones, Ct);
        Assert.Equal([clienteA.Id], listaA!.Items.Select(c => c.Id));
        await using var db = BaseDeDatos.CrearContextoDueno();
        Assert.Equal(agenciaB, await db.Clientes.Where(c => c.Id == clienteB.Id).Select(c => c.AgenciaId).SingleAsync(Ct));
    }

    [Fact]
    public async Task AgenciaSuspendidaNoOperaHastaReactivarla()
    {
        var agencia = await CrearAgenciaAsync("Envíos suspendidos", EstadoAgencia.Suspendida);
        var (_, authUserId) = await CrearEmpleadoAsync(roles: [CodigosRol.Admin], agenciaId: agencia);
        using var admin = Api.Client(TokensDePrueba.Crear(authUserId));

        using (var clientes = await admin.GetAsync("/api/clients", Ct))
        {
            Assert.Equal(HttpStatusCode.Forbidden, clientes.StatusCode);
        }
        using (var yo = await admin.GetAsync("/api/me", Ct))
        {
            await AssertProblema(yo, HttpStatusCode.Forbidden, "Su agencia está suspendida");
        }

        await using (var db = NuevoContexto())
        {
            await db.Agencias.Where(a => a.Id == agencia)
                .ExecuteUpdateAsync(s => s.SetProperty(a => a.Estado, EstadoAgencia.Activa), Ct);
        }

        // Mismo token: el estado de la agencia se lee en cada solicitud.
        using var despues = await admin.GetAsync("/api/clients", Ct);
        Assert.Equal(HttpStatusCode.OK, despues.StatusCode);
    }

    [Theory]
    [InlineData(false, "Su usuario está desactivado")]
    [InlineData(true, "no pertenece a ninguna agencia")]
    public async Task MeExplicaPorQueNoHayAcceso(bool sinCuenta, string motivo)
    {
        var authUserId = sinCuenta ? Guid.NewGuid() : (await CrearEmpleadoAsync(activo: false, roles: [CodigosRol.Admin])).AuthUserId;
        using var client = Api.Client(TokensDePrueba.Crear(authUserId));

        using var response = await client.GetAsync("/api/me", Ct);

        await AssertProblema(response, HttpStatusCode.Forbidden, motivo);
    }

    [Fact]
    public async Task PropietarioSeCreaEnSuPrimerInicioDeSesionYNoVeDatosDeAgencias()
    {
        await using var api = ApiConPropietario();
        var authUserId = Guid.NewGuid();
        // El correo del token puede venir con otras mayúsculas.
        using var client = api.Client(TokenCon(authUserId, "Duena@Plataforma.TEST"));

        var primero = await client.GetFromJsonAsync<CurrentUserResponse>("/api/me", JsonApi.Opciones, Ct);
        var segundo = await client.GetFromJsonAsync<CurrentUserResponse>("/api/me", JsonApi.Opciones, Ct);

        Assert.Equal("PLATAFORMA", primero!.Tipo);
        Assert.Equal([CodigosRol.Plataforma], primero.Roles);
        Assert.Null(primero.Agencia);
        Assert.Equal(primero.Id, segundo!.Id);
        await using (var db = NuevoContexto())
        {
            var propietario = Assert.Single(await db.UsuariosPlataforma.ToListAsync(Ct));
            Assert.Equal(authUserId, propietario.AuthUserId);
        }

        using var clientes = await client.GetAsync("/api/clients", Ct);
        Assert.Equal(HttpStatusCode.Forbidden, clientes.StatusCode);
    }

    [Fact]
    public async Task PrimerInicioDeSesionSimultaneoDelPropietarioCreaUnSoloUsuario()
    {
        await using var api = ApiConPropietario();
        var token = TokenCon(Guid.NewGuid(), CorreoPropietario);

        var respuestas = await Task.WhenAll(Enumerable.Range(0, 4).Select(async _ =>
        {
            using var client = api.Client(token);
            using var response = await client.GetAsync("/api/me", Ct);
            return response.StatusCode;
        }));

        Assert.All(respuestas, estado => Assert.Equal(HttpStatusCode.OK, estado));
        await using var db = NuevoContexto();
        Assert.Equal(1, await db.UsuariosPlataforma.CountAsync(Ct));
    }

    [Fact]
    public async Task CorreoQueNoEsDePropietarioNoCreaNada()
    {
        await using var api = ApiConPropietario();
        using var client = api.Client(TokenCon(Guid.NewGuid(), "otra@plataforma.test"));

        using var response = await client.GetAsync("/api/me", Ct);

        await AssertProblema(response, HttpStatusCode.Forbidden, "no pertenece a ninguna agencia");
        await using var db = NuevoContexto();
        Assert.Equal(0, await db.UsuariosPlataforma.CountAsync(Ct));
    }

    [Fact]
    public async Task PropietarioDesactivadoPierdeElAcceso()
    {
        await using var api = ApiConPropietario();
        var authUserId = Guid.NewGuid();
        using var client = api.Client(TokenCon(authUserId, CorreoPropietario));
        using (var primero = await client.GetAsync("/api/me", Ct))
        {
            Assert.Equal(HttpStatusCode.OK, primero.StatusCode);
        }

        await using (var db = NuevoContexto())
        {
            await db.UsuariosPlataforma.ExecuteUpdateAsync(s => s.SetProperty(p => p.Activo, false), Ct);
        }

        using var despues = await client.GetAsync("/api/me", Ct);
        await AssertProblema(despues, HttpStatusCode.Forbidden, "desactivado");
    }

    private ApiDePrueba ApiConPropietario() => new(
        connection: BaseDeDatos.ConexionApi,
        settings: new Dictionary<string, string?> { ["Plataforma:Propietarios:0"] = CorreoPropietario });

    private static string TokenCon(Guid authUserId, string correo) =>
        TokensDePrueba.Crear(authUserId, claimsExtra: new Dictionary<string, object> { ["email"] = correo });

    private static object Datos(string nombres) =>
        new { nombres, apellidos = "López", telefono = "+505 8888 0001" };

    private static async Task<ClientResponse> Crear(HttpClient client)
    {
        using var response = await client.PostAsJsonAsync("/api/clients", Datos("María"), Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ClientResponse>(JsonApi.Opciones, Ct))!;
    }

    private static async Task AssertProblema(HttpResponseMessage response, HttpStatusCode estado, string detalleContiene)
    {
        Assert.Equal(estado, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problema = (await response.Content.ReadFromJsonAsync<JsonElement>(Ct))!;
        Assert.Contains(detalleContiene, problema.GetProperty("detail").GetString());
    }
}
