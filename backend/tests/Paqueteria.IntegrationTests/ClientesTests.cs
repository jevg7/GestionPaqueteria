using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Paqueteria.Api.Auth;
using Paqueteria.Api.DTOs;
using Paqueteria.IntegrationTests.Infrastructure;

namespace Paqueteria.IntegrationTests;

/// <summary>Módulo de clientes por HTTP, contra PostgreSQL real y con los permisos de cada rol.</summary>
public class ClientesTests(ServidorPostgres servidor) : PruebaHttpConBaseDeDatos(servidor)
{
    [Fact]
    public async Task RegistrarDevuelve201ConCodigoYDatosNormalizados()
    {
        using var agente = await ComoAsync(CodigosRol.Agente);

        using var response = await agente.PostAsJsonAsync("/api/clients",
            Datos(nombres: "  María ", telefono: " +505 8888 0001 ", correo: "", direccion: "   "), Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var creado = await Leer<ClientResponse>(response);
        Assert.Equal("CLI-000001", creado.CodigoCliente);
        Assert.Equal("María", creado.Nombres);
        Assert.Equal("+505 8888 0001", creado.Telefono);
        Assert.Null(creado.Correo);
        Assert.Null(creado.Direccion);
        Assert.True(creado.Activo);
        Assert.Equal($"/api/clients/{creado.Id}", response.Headers.Location?.AbsolutePath);

        var leido = await agente.GetFromJsonAsync<ClientResponse>(response.Headers.Location, Ct);
        Assert.Equal(creado, leido);
    }

    [Theory]
    [InlineData("Nombres", "{\"nombres\":\"   \",\"apellidos\":\"López\",\"telefono\":\"88880001\"}")]
    [InlineData("Apellidos", "{\"nombres\":\"María\",\"telefono\":\"88880001\"}")]
    [InlineData("Telefono", "{\"nombres\":\"María\",\"apellidos\":\"López\"}")]
    [InlineData("Telefono", "{\"nombres\":\"María\",\"apellidos\":\"López\",\"telefono\":\"llamar al vecino\"}")]
    [InlineData("Correo", "{\"nombres\":\"María\",\"apellidos\":\"López\",\"telefono\":\"88880001\",\"correo\":\"no-es-correo\"}")]
    public async Task DatosInvalidosResponden400SinGuardarNada(string campo, string json)
    {
        using var agente = await ComoAsync(CodigosRol.Agente);

        using var response = await agente.PostAsync("/api/clients",
            new StringContent(json, System.Text.Encoding.UTF8, "application/json"), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problema = await Leer<JsonElement>(response);
        Assert.Contains(problema.GetProperty("errors").EnumerateObject(),
            e => e.Name.Equals(campo, StringComparison.OrdinalIgnoreCase));
        await using var db = NuevoContexto();
        Assert.Equal(0, await db.Clientes.CountAsync(Ct));
    }

    [Fact]
    public async Task NombreDemasiadoLargoResponde400()
    {
        using var agente = await ComoAsync(CodigosRol.Agente);

        using var response = await agente.PostAsJsonAsync("/api/clients", Datos(apellidos: new string('x', 101)), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task ActualizarReemplazaLosDatosSinCambiarElCodigo()
    {
        using var agente = await ComoAsync(CodigosRol.Agente);
        var creado = await RegistrarAsync(agente, Datos());

        using var response = await agente.PutAsJsonAsync($"/api/clients/{creado.Id}",
            Datos(telefono: "+505 7777 0000", correo: "maria@correo.test", direccion: "Managua, Bolonia"), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var actualizado = await Leer<ClientResponse>(response);
        Assert.Equal(creado.CodigoCliente, actualizado.CodigoCliente);
        Assert.Equal("+505 7777 0000", actualizado.Telefono);
        Assert.Equal("maria@correo.test", actualizado.Correo);
        Assert.Equal("Managua, Bolonia", actualizado.Direccion);
        Assert.True(actualizado.ActualizadoEn >= creado.ActualizadoEn);
    }

    [Fact]
    public async Task ClienteInexistenteResponde404()
    {
        using var agente = await ComoAsync(CodigosRol.Agente);

        using var get = await agente.GetAsync("/api/clients/999999", Ct);
        using var put = await agente.PutAsJsonAsync("/api/clients/999999", Datos(), Ct);
        using var desactivar = await agente.PostAsync("/api/clients/999999/deactivate", null, Ct);

        foreach (var response in new[] { get, put, desactivar })
        {
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        }
    }

    [Fact]
    public async Task DesactivarYReactivar()
    {
        using var agente = await ComoAsync(CodigosRol.Agente);
        var cliente = await RegistrarAsync(agente, Datos());

        using (var primera = await agente.PostAsync($"/api/clients/{cliente.Id}/deactivate", null, Ct))
        using (var segunda = await agente.PostAsync($"/api/clients/{cliente.Id}/deactivate", null, Ct))
        {
            Assert.Equal(HttpStatusCode.NoContent, primera.StatusCode);
            Assert.Equal(HttpStatusCode.NoContent, segunda.StatusCode); // idempotente
        }
        Assert.False((await agente.GetFromJsonAsync<ClientResponse>($"/api/clients/{cliente.Id}", Ct))!.Activo);
        Assert.Empty((await Buscar(agente, "?activo=true")).Items);
        Assert.Single((await Buscar(agente, "?activo=false")).Items);

        using (var reactivar = await agente.PostAsync($"/api/clients/{cliente.Id}/activate", null, Ct))
        {
            Assert.Equal(HttpStatusCode.NoContent, reactivar.StatusCode);
        }
        Assert.True((await agente.GetFromJsonAsync<ClientResponse>($"/api/clients/{cliente.Id}", Ct))!.Activo);
    }

    [Theory]
    [InlineData("lópez", "López")]
    [InlineData("LÓPEZ", "López")]
    [InlineData("maría lópez", "López")]
    [InlineData("lopez", "López")]         // sin tildes por ambos lados (unaccent)
    [InlineData("maria lopez", "López")]
    [InlineData("PEREZ", "Pérez")]
    [InlineData("rúiz", "Ruiz")]
    [InlineData("88880002", "Pérez")]      // teléfono guardado como "+505 8888-0002"
    [InlineData("8888 0003", "Ruiz")]      // teléfono guardado como "(505) 8888 0003"
    [InlineData("CLI-000003", "Ruiz")]
    [InlineData("jose@", "Pérez")]
    [InlineData("%", "")]                  // % y _ se buscan literales, no son comodines
    [InlineData("_", "")]
    [InlineData("％", "")]                 // de ancho completo: unaccent lo vuelve %, que también va literal
    public async Task BuscaPorNombreTelefonoCorreoYCodigo(string busqueda, string apellidosEsperados)
    {
        using var agente = await ComoAsync(CodigosRol.Agente);
        await RegistrarTresAsync(agente);

        var resultado = await Buscar(agente, $"?search={Uri.EscapeDataString(busqueda)}");

        Assert.Equal(apellidosEsperados, string.Join(",", resultado.Items.Select(c => c.Apellidos)));
    }

    [Fact]
    public async Task PaginaYOrdenaPorApellidos()
    {
        using var agente = await ComoAsync(CodigosRol.Agente);
        await RegistrarTresAsync(agente);

        var pagina1 = await Buscar(agente, "?page=1&pageSize=2");
        var pagina2 = await Buscar(agente, "?page=2&pageSize=2");

        Assert.Equal(["López", "Pérez"], pagina1.Items.Select(c => c.Apellidos));
        Assert.Equal(["Ruiz"], pagina2.Items.Select(c => c.Apellidos));
        Assert.Equal(3, pagina2.Total);
        Assert.Equal(2, pagina2.Page);
        Assert.Equal(2, pagina2.PageSize);
    }

    [Theory]
    [InlineData("?page=0")]
    [InlineData("?pageSize=0")]
    [InlineData("?pageSize=101")]
    public async Task PaginacionInvalidaResponde400(string consulta)
    {
        using var agente = await ComoAsync(CodigosRol.Agente);

        using var response = await agente.GetAsync($"/api/clients{consulta}", Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData(CodigosRol.Admin, "listar", HttpStatusCode.OK)]
    [InlineData(CodigosRol.Admin, "registrar", HttpStatusCode.Created)]
    [InlineData(CodigosRol.Agente, "editar", HttpStatusCode.OK)]
    [InlineData(CodigosRol.Agente, "desactivar", HttpStatusCode.NoContent)]
    [InlineData(CodigosRol.Bodega, "listar", HttpStatusCode.OK)]
    [InlineData(CodigosRol.Bodega, "ver", HttpStatusCode.OK)]
    [InlineData(CodigosRol.Bodega, "registrar", HttpStatusCode.Forbidden)]
    [InlineData(CodigosRol.Bodega, "editar", HttpStatusCode.Forbidden)]
    [InlineData(CodigosRol.Bodega, "desactivar", HttpStatusCode.Forbidden)]
    [InlineData(CodigosRol.Repartidor, "listar", HttpStatusCode.Forbidden)]
    [InlineData(CodigosRol.Repartidor, "ver", HttpStatusCode.Forbidden)]
    public async Task PermisosPorRol(string rol, string operacion, HttpStatusCode esperado)
    {
        long id;
        await using (var db = NuevoContexto())
        {
            id = (await CrearClienteAsync(db)).Id;
        }
        using var client = await ComoAsync(rol);

        using var response = operacion switch
        {
            "listar" => await client.GetAsync("/api/clients", Ct),
            "ver" => await client.GetAsync($"/api/clients/{id}", Ct),
            "registrar" => await client.PostAsJsonAsync("/api/clients", Datos(), Ct),
            "editar" => await client.PutAsJsonAsync($"/api/clients/{id}", Datos(), Ct),
            "desactivar" => await client.PostAsync($"/api/clients/{id}/deactivate", null, Ct),
            _ => throw new ArgumentOutOfRangeException(nameof(operacion)),
        };

        Assert.Equal(esperado, response.StatusCode);
    }

    [Fact]
    public async Task SinTokenResponde401()
    {
        using var anonimo = Api.Client();

        using var response = await anonimo.GetAsync("/api/clients", Ct);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    private static object Datos(
        string nombres = "María",
        string apellidos = "López",
        string telefono = "+505 8888 0001",
        string? correo = null,
        string? direccion = null) =>
        new { nombres, apellidos, telefono, correo, direccion };

    private async Task RegistrarTresAsync(HttpClient client)
    {
        // Se registran desordenados para comprobar el orden por apellidos.
        await RegistrarAsync(client, Datos("José", "Pérez", "+505 8888-0002", "jose@correo.test"));
        await RegistrarAsync(client, Datos("María", "López", "+505 8888 0001", "maria@correo.test"));
        await RegistrarAsync(client, Datos("Luis", "Ruiz", "(505) 8888 0003"));
    }

    private static async Task<ClientResponse> RegistrarAsync(HttpClient client, object datos)
    {
        using var response = await client.PostAsJsonAsync("/api/clients", datos, Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await Leer<ClientResponse>(response);
    }

    private static async Task<PagedResponse<ClientResponse>> Buscar(HttpClient client, string consulta) =>
        (await client.GetFromJsonAsync<PagedResponse<ClientResponse>>($"/api/clients{consulta}", Ct))!;

    private static async Task<T> Leer<T>(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<T>(Ct))!;
}
