using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Paqueteria.Api.Auth;
using Paqueteria.Api.DTOs;
using Paqueteria.Api.Entities;
using Paqueteria.IntegrationTests.Infrastructure;

namespace Paqueteria.IntegrationTests;

/// <summary>Panel del dueño de la plataforma por HTTP: alta de agencias con su primer ADMIN, edición y suspensión.</summary>
public class PlataformaTests(ServidorPostgres servidor) : PruebaHttpConBaseDeDatos(servidor)
{
    [Fact]
    public async Task CrearAgenciaInvitaAlAdminQueEntraConLaConfiguracionInicial()
    {
        var (plataformaId, propietario) = await ComoPropietarioAsync();

        using var response = await propietario.PostAsJsonAsync("/api/platform/agencies",
            Datos(" Envíos Rápidos ", "admin@rapidos.test"), Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var agencia = await Leer<AgencyResponse>(response);
        Assert.Equal("Envíos Rápidos", agencia.Nombre);
        Assert.Equal(EstadoAgencia.Activa, agencia.Estado);
        Assert.Equal("contacto@rapidos.test", agencia.CorreoContacto);
        Assert.Equal($"/api/platform/agencies/{agencia.Id}", response.Headers.Location?.AbsolutePath);

        var invitacion = Assert.Single(Api.Supabase.Invitaciones);
        Assert.Equal("admin@rapidos.test", invitacion.Correo);
        using var admin = Api.Client(TokensDePrueba.Crear(invitacion.AuthUserId));
        var yo = await admin.GetFromJsonAsync<CurrentUserResponse>("/api/me", JsonApi.Opciones, Ct);
        Assert.Equal([CodigosRol.Admin], yo!.Roles);
        Assert.Equal(new AgencyRef(agencia.Id, "Envíos Rápidos", EstadoAgencia.Activa), yo.Agencia);

        // Nace con la ruta Miami → Managua y sus propios correlativos.
        var catalogos = await admin.GetFromJsonAsync<CatalogsResponse>("/api/catalogs", JsonApi.Opciones, Ct);
        var ruta = Assert.Single(catalogos!.Rutas);
        Assert.Equal(("Miami → Managua", "MIA", "MGA"), (ruta.Nombre, ruta.Origen, ruta.Destino));
        using (var cliente = await admin.PostAsJsonAsync("/api/clients",
            new { nombres = "María", apellidos = "López", telefono = "+505 8888 0001" }, Ct))
        {
            Assert.Equal("CLI-000001", (await Leer<ClientResponse>(cliente)).CodigoCliente);
        }

        // La auditoría de la agencia registra al dueño que la creó.
        await using var db = BaseDeDatos.CrearContextoDueno();
        var alta = await db.AuditLogs.SingleAsync(l => l.Tabla == "agencias" && l.RegistroId == agencia.Id.ToString(), Ct);
        Assert.Equal(agencia.Id, alta.AgenciaId);
        Assert.Null(alta.UsuarioId);
        Assert.Equal($"[plataforma {plataformaId}] POST /api/platform/agencies", alta.Origen);
    }

    [Fact]
    public async Task NombreRepetidoResponde409SinInvitar()
    {
        var (_, propietario) = await ComoPropietarioAsync();

        using var response = await propietario.PostAsJsonAsync("/api/platform/agencies",
            Datos("AGENCIA de ejemplo", "admin@rapidos.test"), Ct);

        await AssertProblema(response, HttpStatusCode.Conflict, "Ya existe una agencia con ese nombre");
        Assert.Empty(Api.Supabase.Invitaciones);
    }

    [Fact]
    public async Task CorreoDelAdminYaUsadoResponde409YNoCreaLaAgencia()
    {
        var (_, propietario) = await ComoPropietarioAsync();
        var (empleado, _) = await CrearEmpleadoAsync(roles: [CodigosRol.Agente]);

        using var response = await propietario.PostAsJsonAsync("/api/platform/agencies",
            Datos("Envíos Rápidos", empleado.Correo), Ct);

        await AssertProblema(response, HttpStatusCode.Conflict, "Ya existe un usuario con ese correo");
        await AssertSoloLaAgenciaDeEjemplo();
    }

    [Fact]
    public async Task SiLaInvitacionFallaNoQuedaNadaCreado()
    {
        var (_, propietario) = await ComoPropietarioAsync();
        Api.Supabase.Falla = (HttpStatusCode.BadGateway, null);

        using var response = await propietario.PostAsJsonAsync("/api/platform/agencies",
            Datos("Envíos Rápidos", "admin@rapidos.test"), Ct);

        await AssertProblema(response, HttpStatusCode.ServiceUnavailable, "no está disponible");
        await AssertSoloLaAgenciaDeEjemplo();
        await using var db = BaseDeDatos.CrearContextoDueno();
        Assert.Equal(2, await db.Ubicaciones.CountAsync(Ct));
    }

    [Fact]
    public async Task SinAdminResponde400()
    {
        var (_, propietario) = await ComoPropietarioAsync();

        using var response = await propietario.PostAsJsonAsync("/api/platform/agencies",
            new { agencia = new { nombre = "Envíos Rápidos" } }, Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problema = await Leer<JsonElement>(response);
        Assert.True(problema.GetProperty("errors").TryGetProperty("Admin", out _));
    }

    [Fact]
    public async Task SuspenderDejaSinAccesoASusUsuariosYActivarLoDevuelve()
    {
        var (_, propietario) = await ComoPropietarioAsync();
        using var agente = await ComoAsync(CodigosRol.Agente);
        var id = BaseDeDatosDePrueba.AgenciaDeEjemplo;

        for (var vez = 0; vez < 2; vez++)
        {
            using var suspender = await propietario.PostAsync($"/api/platform/agencies/{id}/suspend", null, Ct);
            Assert.Equal(HttpStatusCode.NoContent, suspender.StatusCode);
        }
        using (var sinAcceso = await agente.GetAsync("/api/clients", Ct))
        {
            Assert.Equal(HttpStatusCode.Forbidden, sinAcceso.StatusCode);
        }
        var suspendida = await propietario.GetFromJsonAsync<AgencyResponse>($"/api/platform/agencies/{id}", JsonApi.Opciones, Ct);
        Assert.Equal(EstadoAgencia.Suspendida, suspendida!.Estado);
        Assert.Equal([id], await Ids(propietario, "?estado=SUSPENDIDA"));

        using (var activar = await propietario.PostAsync($"/api/platform/agencies/{id}/activate", null, Ct))
        {
            Assert.Equal(HttpStatusCode.NoContent, activar.StatusCode);
        }
        using var conAcceso = await agente.GetAsync("/api/clients", Ct);
        Assert.Equal(HttpStatusCode.OK, conAcceso.StatusCode);
        using var inexistente = await propietario.PostAsync("/api/platform/agencies/999999/suspend", null, Ct);
        Assert.Equal(HttpStatusCode.NotFound, inexistente.StatusCode);
    }

    [Fact]
    public async Task EditarReemplazaLosDatosDeLaAgencia()
    {
        var (_, propietario) = await ComoPropietarioAsync();
        var id = BaseDeDatosDePrueba.AgenciaDeEjemplo;

        using var response = await propietario.PutAsJsonAsync($"/api/platform/agencies/{id}",
            new { nombre = "Agencia Central", ruc = "J0310000000001", correoContacto = "", telefono = (string?)null }, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var agencia = await Leer<AgencyResponse>(response);
        Assert.Equal(("Agencia Central", "J0310000000001", (string?)null), (agencia.Nombre, agencia.Ruc, agencia.CorreoContacto));
        Assert.Equal([id], await Ids(propietario, "?search=central"));
    }

    [Fact]
    public async Task EmpleadosDeAgenciaNoEntranAlPanelDeLaPlataforma()
    {
        using var admin = await ComoAsync(CodigosRol.Admin);

        using var listar = await admin.GetAsync("/api/platform/agencies", Ct);
        using var suspender = await admin.PostAsync($"/api/platform/agencies/{BaseDeDatosDePrueba.AgenciaDeEjemplo}/suspend", null, Ct);

        Assert.Equal(HttpStatusCode.Forbidden, listar.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, suspender.StatusCode);
    }

    private async Task<(long Id, HttpClient Client)> ComoPropietarioAsync()
    {
        await using var db = NuevoContexto();
        var propietario = new UsuarioPlataforma
        {
            AuthUserId = Guid.NewGuid(),
            Nombres = "Dueña",
            Apellidos = "Plataforma",
            Correo = "duena@plataforma.test",
        };
        db.UsuariosPlataforma.Add(propietario);
        await db.SaveChangesAsync(Ct);
        return (propietario.Id, Api.Client(TokensDePrueba.Crear(propietario.AuthUserId!.Value)));
    }

    private async Task AssertSoloLaAgenciaDeEjemplo()
    {
        await using var db = NuevoContexto();
        Assert.Equal([BaseDeDatosDePrueba.AgenciaDeEjemplo], await db.Agencias.Select(a => a.Id).ToListAsync(Ct));
        Assert.Empty(Api.Supabase.Invitaciones);
    }

    private static async Task<long[]> Ids(HttpClient client, string consulta) =>
        (await client.GetFromJsonAsync<PagedResponse<AgencyResponse>>($"/api/platform/agencies{consulta}", JsonApi.Opciones, Ct))!
            .Items.Select(a => a.Id).ToArray();

    private static object Datos(string nombre, string correoAdmin) => new
    {
        agencia = new { nombre, ruc = "J0310000000099", correoContacto = "Contacto@Rapidos.test", telefono = "+505 2222 1111" },
        admin = new { nombres = "Ada", apellidos = "Admin", correo = correoAdmin },
    };

    private static async Task AssertProblema(HttpResponseMessage response, HttpStatusCode estado, string detalleContiene)
    {
        Assert.Equal(estado, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problema = await Leer<JsonElement>(response);
        Assert.Contains(detalleContiene, problema.GetProperty("detail").GetString());
    }

    private static async Task<T> Leer<T>(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<T>(JsonApi.Opciones, Ct))!;
}
