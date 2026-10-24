using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Paqueteria.Api.Auth;
using Paqueteria.Api.DTOs;
using Paqueteria.IntegrationTests.Infrastructure;

namespace Paqueteria.IntegrationTests;

/// <summary>Usuarios de la agencia por HTTP: alta con invitación (Supabase simulado), roles, activación y reglas del ADMIN.</summary>
public class UsuariosTests(ServidorPostgres servidor) : PruebaHttpConBaseDeDatos(servidor)
{
    [Fact]
    public async Task CrearInvitaPorCorreoYElInvitadoEntraConSusRoles()
    {
        using var admin = await ComoAsync(CodigosRol.Admin);

        using var response = await admin.PostAsJsonAsync("/api/users",
            Datos(" Ana.Perez@Agencia.Test ", "agente", "BODEGA", "AGENTE"), Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var usuario = await Leer<UserResponse>(response);
        Assert.Equal("ana.perez@agencia.test", usuario.Correo);
        Assert.Equal([CodigosRol.Agente, CodigosRol.Bodega], usuario.Roles);
        Assert.True(usuario.Activo);
        Assert.Equal($"/api/users/{usuario.Id}", response.Headers.Location?.AbsolutePath);

        var invitacion = Assert.Single(Api.Supabase.Invitaciones);
        Assert.Equal("ana.perez@agencia.test", invitacion.Correo);
        Assert.Equal(SupabaseDePrueba.RedirectUrl, invitacion.RedirectTo);
        Assert.Equal(SupabaseDePrueba.Clave, invitacion.ApiKey);
        Assert.Null(invitacion.Authorization);

        // Al aceptar la invitación inicia sesión con la cuenta que creó Supabase.
        using var invitado = Api.Client(TokensDePrueba.Crear(invitacion.AuthUserId));
        var yo = await invitado.GetFromJsonAsync<CurrentUserResponse>("/api/me", JsonApi.Opciones, Ct);
        Assert.Equal(usuario.Id, yo!.Id);
        Assert.Equal([CodigosRol.Agente, CodigosRol.Bodega], yo.Roles);
    }

    [Fact]
    public async Task CorreoDeUsuarioDeOtraAgenciaResponde409SinInvitar()
    {
        var agenciaB = await CrearAgenciaAsync("Envíos B");
        using var adminB = await ComoEnAgenciaAsync(agenciaB, CodigosRol.Admin);
        using (var creado = await adminB.PostAsJsonAsync("/api/users", Datos("luis@agencia.test", CodigosRol.Agente), Ct))
        {
            Assert.Equal(HttpStatusCode.Created, creado.StatusCode);
        }
        using var adminA = await ComoAsync(CodigosRol.Admin);

        using var response = await adminA.PostAsJsonAsync("/api/users", Datos("LUIS@agencia.test", CodigosRol.Agente), Ct);

        await AssertProblema(response, HttpStatusCode.Conflict, "Ya existe un usuario con ese correo");
        Assert.Single(Api.Supabase.Invitaciones);
    }

    [Theory]
    [InlineData(CodigosRol.Plataforma)]
    [InlineData("SUPERVISOR")]
    public async Task RolQueNoEsDeAgenciaResponde400(string rol)
    {
        using var admin = await ComoAsync(CodigosRol.Admin);

        using var response = await admin.PostAsJsonAsync("/api/users", Datos("ana@agencia.test", CodigosRol.Agente, rol), Ct);

        await AssertProblema(response, HttpStatusCode.BadRequest, $"El rol {rol} no existe");
        Assert.Empty(Api.Supabase.Invitaciones);
    }

    [Fact]
    public async Task SinRolesResponde400()
    {
        using var admin = await ComoAsync(CodigosRol.Admin);

        using var response = await admin.PostAsJsonAsync("/api/users", Datos("ana@agencia.test"), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData(HttpStatusCode.InternalServerError, null, HttpStatusCode.ServiceUnavailable, "no está disponible")]
    [InlineData(HttpStatusCode.TooManyRequests, "over_email_send_rate_limit", HttpStatusCode.ServiceUnavailable, "límite de correos")]
    [InlineData(HttpStatusCode.UnprocessableEntity, "email_exists", HttpStatusCode.Conflict, "ya fue aceptada")]
    [InlineData(HttpStatusCode.UnprocessableEntity, "email_address_invalid", HttpStatusCode.BadRequest, "rechazó el correo")]
    public async Task SiLaInvitacionFallaElUsuarioNoSeCrea(HttpStatusCode supabase, string? codigo, HttpStatusCode esperado, string detalle)
    {
        using var admin = await ComoAsync(CodigosRol.Admin);
        Api.Supabase.Falla = (supabase, codigo);

        using var response = await admin.PostAsJsonAsync("/api/users", Datos("ana@agencia.test", CodigosRol.Agente), Ct);

        await AssertProblema(response, esperado, detalle);
        await using var db = NuevoContexto();
        Assert.False(await db.Usuarios.AnyAsync(u => u.Correo == "ana@agencia.test", Ct));
    }

    [Fact]
    public async Task SinSupabaseConfiguradoResponde503()
    {
        await using var api = new ApiDePrueba(connection: BaseDeDatos.ConexionApi,
            settings: new Dictionary<string, string?> { ["Supabase:Url"] = "", ["Supabase:ServiceRoleKey"] = "" });
        var (_, authUserId) = await CrearEmpleadoAsync(roles: [CodigosRol.Admin]);
        using var admin = api.Client(TokensDePrueba.Crear(authUserId));

        using var response = await admin.PostAsJsonAsync("/api/users", Datos("ana@agencia.test", CodigosRol.Agente), Ct);

        await AssertProblema(response, HttpStatusCode.ServiceUnavailable, "no están configuradas");
    }

    [Fact]
    public async Task ActualizarReemplazaRolesYSurteEfectoDeInmediato()
    {
        using var admin = await ComoAsync(CodigosRol.Admin);
        var usuario = await CrearPorApiAsync(admin, "ana@agencia.test", CodigosRol.Agente, CodigosRol.Bodega);
        using var ana = Api.Client(TokensDePrueba.Crear(Api.Supabase.CuentaDe("ana@agencia.test")));

        using var response = await admin.PutAsJsonAsync($"/api/users/{usuario.Id}",
            new { nombres = " Ana María ", apellidos = "Pérez", telefono = "", roles = new[] { "BODEGA", "REPARTIDOR" } }, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var actualizado = await Leer<UserResponse>(response);
        Assert.Equal("Ana María", actualizado.Nombres);
        Assert.Null(actualizado.Telefono);
        Assert.Equal([CodigosRol.Bodega, CodigosRol.Repartidor], actualizado.Roles);
        Assert.Equal("ana@agencia.test", actualizado.Correo);
        var yo = await ana.GetFromJsonAsync<CurrentUserResponse>("/api/me", JsonApi.Opciones, Ct);
        Assert.Equal([CodigosRol.Bodega, CodigosRol.Repartidor], yo!.Roles);
    }

    [Fact]
    public async Task NadieSeQuitaSuPropioAdminNiSeDesactivaASiMismo()
    {
        var (yo, authUserId) = await CrearEmpleadoAsync(roles: [CodigosRol.Admin]);
        using var admin = Api.Client(TokensDePrueba.Crear(authUserId));

        using (var quitar = await admin.PutAsJsonAsync($"/api/users/{yo.Id}",
            new { nombres = "Bruno", apellidos = "Bodega", roles = new[] { CodigosRol.Agente } }, Ct))
        {
            await AssertProblema(quitar, HttpStatusCode.Conflict, "No puede quitarse su propio rol ADMIN");
        }
        using (var desactivar = await admin.PostAsync($"/api/users/{yo.Id}/deactivate", null, Ct))
        {
            await AssertProblema(desactivar, HttpStatusCode.Conflict, "No puede desactivar su propio usuario");
        }

        var sigo = await admin.GetFromJsonAsync<UserResponse>($"/api/users/{yo.Id}", JsonApi.Opciones, Ct);
        Assert.True(sigo!.Activo);
        Assert.Equal([CodigosRol.Admin], sigo.Roles);
    }

    [Fact]
    public async Task DesactivarQuitaElAccesoYActivarLoDevuelve()
    {
        using var admin = await ComoAsync(CodigosRol.Admin);
        var usuario = await CrearPorApiAsync(admin, "ana@agencia.test", CodigosRol.Agente);
        using var ana = Api.Client(TokensDePrueba.Crear(Api.Supabase.CuentaDe("ana@agencia.test")));

        using (var desactivar = await admin.PostAsync($"/api/users/{usuario.Id}/deactivate", null, Ct))
        {
            Assert.Equal(HttpStatusCode.NoContent, desactivar.StatusCode);
        }
        using (var sinAcceso = await ana.GetAsync("/api/clients", Ct))
        {
            Assert.Equal(HttpStatusCode.Forbidden, sinAcceso.StatusCode);
        }
        using (var activar = await admin.PostAsync($"/api/users/{usuario.Id}/activate", null, Ct))
        {
            Assert.Equal(HttpStatusCode.NoContent, activar.StatusCode);
        }
        using var conAcceso = await ana.GetAsync("/api/clients", Ct);
        Assert.Equal(HttpStatusCode.OK, conAcceso.StatusCode);
    }

    [Fact]
    public async Task DosAdminQueSeDesactivanALaVezNoDejanLaAgenciaSinAdmin()
    {
        var (a, authA) = await CrearEmpleadoAsync(roles: [CodigosRol.Admin]);
        var (b, authB) = await CrearEmpleadoAsync(roles: [CodigosRol.Admin]);
        using var adminA = Api.Client(TokensDePrueba.Crear(authA));
        using var adminB = Api.Client(TokensDePrueba.Crear(authB));

        // Retiene la fila de la agencia para que las dos solicitudes, ya autenticadas, esperen juntas.
        await using var retencion = new NpgsqlConnection(BaseDeDatos.ConexionDueno);
        await retencion.OpenAsync(Ct);
        await using var transaccion = await retencion.BeginTransactionAsync(Ct);
        await using (var bloqueo = new NpgsqlCommand(
            $"select 1 from paqueteria.agencias where id = {BaseDeDatosDePrueba.AgenciaDeEjemplo} for update", retencion, transaccion))
        {
            await bloqueo.ExecuteNonQueryAsync(Ct);
        }

        var aDesactivaB = adminA.PostAsync($"/api/users/{b.Id}/deactivate", null, Ct);
        var bDesactivaA = adminB.PostAsync($"/api/users/{a.Id}/deactivate", null, Ct);
        await EsperarBloqueadasAsync(2);
        await transaccion.RollbackAsync(Ct);

        var respuestas = await Task.WhenAll(aDesactivaB, bDesactivaA);
        var estados = respuestas.Select(r => r.StatusCode).Order().ToArray();
        Assert.Equal([HttpStatusCode.NoContent, HttpStatusCode.Conflict], estados);
        await AssertProblema(respuestas.Single(r => r.StatusCode == HttpStatusCode.Conflict),
            HttpStatusCode.Conflict, "al menos un ADMIN activo");
        await using var db = NuevoContexto();
        Assert.Equal(1, await db.Usuarios.CountAsync(u => (u.Id == a.Id || u.Id == b.Id) && u.Activo, Ct));
        foreach (var respuesta in respuestas)
        {
            respuesta.Dispose();
        }
    }

    [Fact]
    public async Task ReenviarInvitacionUsaLaMismaCuentaHastaQueSeAcepta()
    {
        using var admin = await ComoAsync(CodigosRol.Admin);
        var usuario = await CrearPorApiAsync(admin, "ana@agencia.test", CodigosRol.Agente);

        using (var reenviar = await admin.PostAsync($"/api/users/{usuario.Id}/resend-invite", null, Ct))
        {
            Assert.Equal(HttpStatusCode.NoContent, reenviar.StatusCode);
        }
        Assert.Equal(2, Api.Supabase.Invitaciones.Count);
        Assert.Single(Api.Supabase.Invitaciones.Select(i => i.AuthUserId).Distinct());

        Api.Supabase.Confirmadas["ana@agencia.test"] = true;
        using var aceptada = await admin.PostAsync($"/api/users/{usuario.Id}/resend-invite", null, Ct);
        await AssertProblema(aceptada, HttpStatusCode.Conflict, "ya fue aceptada");
    }

    [Fact]
    public async Task ReenviarAUnUsuarioDesactivadoResponde409()
    {
        using var admin = await ComoAsync(CodigosRol.Admin);
        var usuario = await CrearPorApiAsync(admin, "ana@agencia.test", CodigosRol.Agente);
        using (var desactivar = await admin.PostAsync($"/api/users/{usuario.Id}/deactivate", null, Ct))
        {
            Assert.Equal(HttpStatusCode.NoContent, desactivar.StatusCode);
        }

        using var response = await admin.PostAsync($"/api/users/{usuario.Id}/resend-invite", null, Ct);

        await AssertProblema(response, HttpStatusCode.Conflict, "Actívelo antes");
        Assert.Single(Api.Supabase.Invitaciones);
    }

    [Fact]
    public async Task SoloAdminYSoloDeSuAgencia()
    {
        using var adminA = await ComoAsync(CodigosRol.Admin);
        var usuarioA = await CrearPorApiAsync(adminA, "ana@agencia.test", CodigosRol.Agente);
        var agenciaB = await CrearAgenciaAsync("Envíos B");
        using var adminB = await ComoEnAgenciaAsync(agenciaB, CodigosRol.Admin);
        using var agente = await ComoAsync(CodigosRol.Agente);

        using (var sinPermiso = await agente.GetAsync("/api/users", Ct))
        {
            Assert.Equal(HttpStatusCode.Forbidden, sinPermiso.StatusCode);
        }
        using (var otraAgencia = await adminB.GetAsync($"/api/users/{usuarioA.Id}", Ct))
        {
            Assert.Equal(HttpStatusCode.NotFound, otraAgencia.StatusCode);
        }
        using (var desactivar = await adminB.PostAsync($"/api/users/{usuarioA.Id}/deactivate", null, Ct))
        {
            Assert.Equal(HttpStatusCode.NotFound, desactivar.StatusCode);
        }
        var listaB = await adminB.GetFromJsonAsync<PagedResponse<UserResponse>>("/api/users", JsonApi.Opciones, Ct);
        Assert.DoesNotContain(listaB!.Items, u => u.Id == usuarioA.Id);
    }

    [Fact]
    public async Task BuscarFiltraPorTextoRolYEstado()
    {
        using var admin = await ComoAsync(CodigosRol.Admin);
        var ana = await CrearPorApiAsync(admin, "ana@agencia.test", CodigosRol.Agente);
        var rafa = await CrearPorApiAsync(admin, "rafa@agencia.test", CodigosRol.Repartidor);
        using (var desactivar = await admin.PostAsync($"/api/users/{rafa.Id}/deactivate", null, Ct))
        {
            Assert.Equal(HttpStatusCode.NoContent, desactivar.StatusCode);
        }

        Assert.Equal([ana.Id], await Ids(admin, "?search=ANA@"));
        Assert.Equal([ana.Id, rafa.Id], await Ids(admin, "?search=ana perez")); // sin tildes: "Ana Pérez"
        Assert.Equal([rafa.Id], await Ids(admin, "?rol=repartidor"));
        Assert.DoesNotContain(rafa.Id, await Ids(admin, "?activo=true"));
        var roles = await admin.GetFromJsonAsync<List<RoleResponse>>("/api/users/roles", JsonApi.Opciones, Ct);
        Assert.Equal(CodigosRol.DeAgencia, roles!.Select(r => r.Codigo));
    }

    private async Task EsperarBloqueadasAsync(int cuantas)
    {
        await using var conexion = new NpgsqlConnection(BaseDeDatos.ConexionDueno);
        await conexion.OpenAsync(Ct);
        // pg_locks, no pg_stat_activity: esta oculta wait_event de las sesiones de otro usuario (la API).
        await using var consulta = new NpgsqlCommand(
            "select count(distinct l.pid) from pg_locks l join pg_stat_activity a on a.pid = l.pid " +
            "where not l.granted and a.datname = current_database()", conexion);
        for (var intento = 0; intento < 200; intento++)
        {
            if ((long)(await consulta.ExecuteScalarAsync(Ct))! >= cuantas)
            {
                return;
            }
            await Task.Delay(50, Ct);
        }
        Assert.Fail($"No se bloquearon {cuantas} solicitudes.");
    }

    private static async Task<UserResponse> CrearPorApiAsync(HttpClient admin, string correo, params string[] roles)
    {
        using var response = await admin.PostAsJsonAsync("/api/users", Datos(correo, roles), Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await Leer<UserResponse>(response);
    }

    private static async Task<long[]> Ids(HttpClient client, string consulta) =>
        (await client.GetFromJsonAsync<PagedResponse<UserResponse>>($"/api/users{consulta}", JsonApi.Opciones, Ct))!
            .Items.Select(u => u.Id).ToArray();

    private static object Datos(string correo, params string[] roles) =>
        new { nombres = "Ana", apellidos = "Pérez", correo, telefono = "+505 8888 0002", roles };

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
