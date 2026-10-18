using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Paqueteria.Api.Auth;
using Paqueteria.Api.DTOs;
using Paqueteria.Api.Entities;
using Paqueteria.Api.Services;
using Paqueteria.IntegrationTests.Infrastructure;

namespace Paqueteria.IntegrationTests;

/// <summary>Auditoría por triggers (migración Auditoria): qué se registra, con qué usuario y que es inmutable.</summary>
public class AuditoriaTests(ServidorPostgres servidor) : PruebaHttpConBaseDeDatos(servidor)
{
    [Fact]
    public async Task LosCambiosDeLaApiQuedanConUsuarioOrigenYSoloLoQueCambio()
    {
        var (agenteUsuario, agenteSub) = await CrearEmpleadoAsync(roles: [CodigosRol.Agente]);
        using var agente = Api.Client(TokensDePrueba.Crear(agenteSub));
        using var admin = await ComoAsync(CodigosRol.Admin);

        var cliente = (await (await agente.PostAsJsonAsync("/api/clients",
            new { nombres = "María", apellidos = "López", telefono = "+505 8888 0001" }, Ct))
            .Content.ReadFromJsonAsync<ClientResponse>(Ct))!;
        using (var put = await agente.PutAsJsonAsync($"/api/clients/{cliente.Id}",
            new { nombres = "María", apellidos = "López", telefono = "+505 7777 0000" }, Ct))
        {
            Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        }

        var logs = await AuditoriaAsync(admin, $"?tabla=clientes&registroId={cliente.Id}");

        Assert.Equal([AccionAuditoria.Update, AccionAuditoria.Insert], logs.Select(l => l.Accion)); // más reciente primero
        var alta = logs[1];
        Assert.Equal(agenteUsuario.Id, alta.UsuarioId);
        Assert.Equal("Bruno Bodega", alta.Usuario);
        Assert.Equal("POST /api/clients", alta.Origen);
        Assert.False(string.IsNullOrEmpty(alta.TraceId));
        Assert.Equal("CLI-000001", alta.ValoresNuevos!.Value.GetProperty("codigo_cliente").GetString());

        var edicion = logs[0];
        Assert.Equal($"PUT /api/clients/{cliente.Id}", edicion.Origen);
        // Solo la columna que cambió (ni actualizado_en ni las demás).
        var anterior = Assert.Single(edicion.ValoresAnteriores!.Value.EnumerateObject());
        var nuevo = Assert.Single(edicion.ValoresNuevos!.Value.EnumerateObject());
        Assert.Equal(("telefono", "+505 8888 0001"), (anterior.Name, anterior.Value.GetString()));
        Assert.Equal(("telefono", "+505 7777 0000"), (nuevo.Name, nuevo.Value.GetString()));
    }

    [Fact]
    public async Task LosCambiosQueHaceUnTriggerTambienQuedanConElUsuarioDeLaSolicitud()
    {
        var (bodegaUsuario, bodegaSub) = await CrearEmpleadoAsync(roles: [CodigosRol.Bodega]);
        using var bodega = Api.Client(TokensDePrueba.Crear(bodegaSub));
        using var agente = await ComoAsync(CodigosRol.Agente);
        using var admin = await ComoAsync(CodigosRol.Admin);
        long clienteId;
        await using (var db = NuevoContexto())
        {
            clienteId = (await CrearClienteAsync(db)).Id;
        }
        var paquete = (await (await agente.PostAsJsonAsync("/api/packages",
            new { clienteId, metodoEnvio = "AEREO", descripcion = "Audífonos" }, Ct))
            .Content.ReadFromJsonAsync<PackageResponse>(Ct))!;

        using (var recibir = await bodega.PostAsync($"/api/packages/{paquete.Id}/receive-miami", null, Ct))
        {
            Assert.Equal(HttpStatusCode.OK, recibir.StatusCode);
        }

        // El estado lo cambia el trigger del historial, no la API: igual queda con quién y desde dónde.
        var cambio = (await AuditoriaAsync(admin, $"?tabla=paquetes&registroId={paquete.Id}&accion=update")).Single();
        Assert.Equal(bodegaUsuario.Id, cambio.UsuarioId);
        Assert.Equal($"POST /api/packages/{paquete.Id}/receive-miami", cambio.Origen);
        Assert.Equal(1, cambio.ValoresAnteriores!.Value.GetProperty("estado_actual_id").GetInt32());
        Assert.Equal(2, cambio.ValoresNuevos!.Value.GetProperty("estado_actual_id").GetInt32());
        Assert.True(cambio.ValoresNuevos.Value.TryGetProperty("fecha_recepcion_miami", out _));
        Assert.False(cambio.ValoresNuevos.Value.TryGetProperty("actualizado_en", out _));
    }

    [Fact]
    public async Task UnCambioPorSqlFueraDeLaApiQuedaSinUsuario()
    {
        using var admin = await ComoAsync(CodigosRol.Admin);

        // Las tarifas hoy se cargan por SQL: solo un trigger puede auditarlas.
        await using (var conexion = new NpgsqlConnection(BaseDeDatos.ConexionDueno))
        {
            await conexion.OpenAsync(Ct);
            await using var comando = new NpgsqlCommand(
                "update paqueteria.tarifas_envio set precio_por_unidad = 3.75 where precio_por_unidad = 3.50", conexion);
            Assert.Equal(1, await comando.ExecuteNonQueryAsync(Ct));
        }

        var cambio = (await AuditoriaAsync(admin, "?tabla=tarifas_envio&accion=UPDATE")).Single();
        Assert.Null(cambio.UsuarioId);
        Assert.Null(cambio.Origen);
        Assert.Equal(3.50m, cambio.ValoresAnteriores!.Value.GetProperty("precio_por_unidad").GetDecimal());
        Assert.Equal(3.75m, cambio.ValoresNuevos!.Value.GetProperty("precio_por_unidad").GetDecimal());
    }

    [Fact]
    public async Task UnUpdateSinCambiosRealesNoSeAudita()
    {
        using var admin = await ComoAsync(CodigosRol.Admin);
        long clienteId;
        await using (var db = NuevoContexto())
        {
            clienteId = (await CrearClienteAsync(db)).Id;
            // Solo cambia actualizado_en (trigger): no hay nada que auditar.
            await db.Database.ExecuteSqlAsync($"update paqueteria.clientes set telefono = telefono where id = {clienteId}", Ct);
        }

        var logs = await AuditoriaAsync(admin, $"?tabla=clientes&registroId={clienteId}");

        Assert.Equal([AccionAuditoria.Insert], logs.Select(l => l.Accion));
    }

    [Fact]
    public async Task QuitarUnRolQuedaAuditadoComoDeleteConClaveCompuesta()
    {
        var (usuario, _) = await CrearEmpleadoAsync(roles: [CodigosRol.Bodega]);
        using var admin = await ComoAsync(CodigosRol.Admin);
        short rolId;
        await using (var db = NuevoContexto())
        {
            rolId = await db.Roles.Where(r => r.Codigo == CodigosRol.Bodega).Select(r => r.Id).SingleAsync(Ct);
            await db.UsuarioRoles.Where(ur => ur.UsuarioId == usuario.Id).ExecuteDeleteAsync(Ct);
        }

        var borrado = (await AuditoriaAsync(admin, $"?tabla=usuario_roles&registroId={usuario.Id},{rolId}&accion=delete")).Single();

        Assert.Null(borrado.ValoresNuevos);
        Assert.Equal(usuario.Id, borrado.ValoresAnteriores!.Value.GetProperty("usuario_id").GetInt64());
    }

    [Fact]
    public async Task LasVariablesDeSesionNoPasanAOtraSolicitudPorElPool()
    {
        using var agente = await ComoAsync(CodigosRol.Agente);
        using var admin = await ComoAsync(CodigosRol.Admin);
        using (var alta = await agente.PostAsJsonAsync("/api/clients",
            new { nombres = "Ana", apellidos = "Ruiz", telefono = "+505 8888 0002" }, Ct))
        {
            Assert.Equal(HttpStatusCode.Created, alta.StatusCode);
        }

        // Mismo proceso y misma cadena de conexión que la API: reutiliza conexiones de su pool. La
        // agencia, el usuario y el origen de la solicitud anterior no deben seguir en la sesión.
        await using var conexion = new NpgsqlConnection(BaseDeDatos.ConexionApi);
        await conexion.OpenAsync(Ct);
        await using var comando = new NpgsqlCommand(
            """
            select coalesce(current_setting('paqueteria.agencia_id', true), '')
                || coalesce(current_setting('paqueteria.usuario_id', true), '')
                || coalesce(current_setting('paqueteria.origen', true), '')
            """, conexion);

        Assert.Equal("", (string?)await comando.ExecuteScalarAsync(Ct));
    }

    [Fact]
    public async Task LaAuditoriaEsInmutable()
    {
        await using (var db = NuevoContexto())
        {
            await CrearClienteAsync(db);
        }

        // Usuario de la API: sin privilegio de UPDATE ni DELETE.
        await AssertSqlStateAsync(BaseDeDatos.ConexionApi, "update paqueteria.audit_logs set tabla = 'x'", PostgresErrorCodes.InsufficientPrivilege);
        await AssertSqlStateAsync(BaseDeDatos.ConexionApi, "delete from paqueteria.audit_logs", PostgresErrorCodes.InsufficientPrivilege);
        // Dueño del esquema: lo impiden los triggers.
        await AssertSqlStateAsync(BaseDeDatos.ConexionDueno, "update paqueteria.audit_logs set tabla = 'x'", PostgresErrorCodes.RestrictViolation);
        await AssertSqlStateAsync(BaseDeDatos.ConexionDueno, "delete from paqueteria.audit_logs", PostgresErrorCodes.RestrictViolation);
        await AssertSqlStateAsync(BaseDeDatos.ConexionDueno, "truncate paqueteria.audit_logs", PostgresErrorCodes.RestrictViolation);
    }

    [Fact]
    public async Task FiltrosYAccionInvalida()
    {
        var (agenteUsuario, agenteSub) = await CrearEmpleadoAsync(roles: [CodigosRol.Agente]);
        using var agente = Api.Client(TokensDePrueba.Crear(agenteSub));
        using var admin = await ComoAsync(CodigosRol.Admin);
        using (var alta = await agente.PostAsJsonAsync("/api/clients",
            new { nombres = "Ana", apellidos = "Ruiz", telefono = "+505 8888 0002" }, Ct))
        {
            Assert.Equal(HttpStatusCode.Created, alta.StatusCode);
        }

        var delAgente = await AuditoriaAsync(admin, $"?usuarioId={agenteUsuario.Id}");
        Assert.Equal(["clientes"], delAgente.Select(l => l.Tabla));
        Assert.Empty(await AuditoriaAsync(admin, $"?usuarioId={agenteUsuario.Id}&desde={Uri.EscapeDataString(DateTimeOffset.UtcNow.AddMinutes(10).ToString("O"))}"));

        using var invalida = await admin.GetAsync("/api/audit-logs?accion=BORRAR", Ct);
        Assert.Equal(HttpStatusCode.BadRequest, invalida.StatusCode);
        var problema = await invalida.Content.ReadFromJsonAsync<JsonElement>(Ct);
        Assert.Contains("La acción 'BORRAR' no existe", problema.GetProperty("detail").GetString());
    }

    [Theory]
    [InlineData(CodigosRol.Admin, HttpStatusCode.OK)]
    [InlineData(CodigosRol.Agente, HttpStatusCode.Forbidden)]
    [InlineData(CodigosRol.Bodega, HttpStatusCode.Forbidden)]
    [InlineData(CodigosRol.Repartidor, HttpStatusCode.Forbidden)]
    public async Task SoloAdminConsulta(string rol, HttpStatusCode esperado)
    {
        using var client = await ComoAsync(rol);

        using var response = await client.GetAsync("/api/audit-logs", Ct);

        Assert.Equal(esperado, response.StatusCode);
    }

    private static async Task<List<AuditLogResponse>> AuditoriaAsync(HttpClient admin, string consulta) =>
        (await admin.GetFromJsonAsync<PagedResponse<AuditLogResponse>>($"/api/audit-logs{consulta}", JsonApi.Opciones, Ct))!
            .Items.ToList();

    private static async Task AssertSqlStateAsync(string connectionString, string sql, string sqlState)
    {
        await using var conexion = new NpgsqlConnection(connectionString);
        await conexion.OpenAsync(Ct);
        await using var comando = new NpgsqlCommand(sql, conexion);
        var error = await Assert.ThrowsAsync<PostgresException>(() => comando.ExecuteNonQueryAsync(Ct));
        Assert.Equal(sqlState, error.SqlState);
    }
}
