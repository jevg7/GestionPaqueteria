using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Npgsql;
using Paqueteria.Api.Data;
using Paqueteria.Api.Middleware;
using Paqueteria.IntegrationTests.Infrastructure;

namespace Paqueteria.IntegrationTests;

public class ApiInfrastructureTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task HealthFuncionaSinBaseDeDatosNiConexionOwner()
    {
        await using var factory = new ApiDePrueba();
        using var client = factory.Client();
        using var response = await client.GetAsync("/health", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("{\"status\":\"ok\"}", await response.Content.ReadAsStringAsync(Ct));
    }

    [Theory]
    [InlineData("Development", "application/json")]
    [InlineData("Production", "application/json")]
    [InlineData("Production", "text/html")]
    public async Task ErrorInesperadoDevuelveProblemDetailsSinInformacionSensible(string environment, string accept)
    {
        await using var factory = new ApiDePrueba(environment);
        using var client = factory.Client();
        client.DefaultRequestHeaders.Accept.ParseAdd(accept);
        using var response = await client.GetAsync("/__test/errors/unexpected", Ct);
        await AssertProblem(response, 500);
        Assert.Contains(factory.Logs.Entries, e => e.Level == LogLevel.Error && e.Text.Contains("InvalidOperationException"));
        Assert.DoesNotContain(factory.Logs.Entries, e => e.Text.Contains(ErrorProbeController.SensitiveMarker));
    }

    [Theory]
    [InlineData("23505", 409)]
    [InlineData("23P01", 409)]
    [InlineData("23001", 409)]
    [InlineData("23514", 400)]
    [InlineData("23503", 400)]
    [InlineData("42501", 500)]
    [InlineData("XX000", 500)]
    public async Task PostgresAnidadoDevuelveElEstadoEsperado(string sqlState, int status)
    {
        var postgres = new PostgresException(ErrorProbeController.SensitiveMarker, "ERROR", "ERROR", sqlState);
        var wrapped = new Exception("commit", new DbUpdateException("save", postgres));
        Assert.Same(postgres, PostgresExceptionMapper.Find(postgres));
        Assert.Same(postgres, PostgresExceptionMapper.Find(wrapped));
        Assert.Equal(status, PostgresExceptionMapper.GetStatusCode(postgres));

        await using var factory = new ApiDePrueba();
        using var client = factory.Client();
        using var response = await client.GetAsync($"/__test/errors/{sqlState}", Ct);
        await AssertProblem(response, status);
        Assert.Contains(factory.Logs.Entries, e => e.Text.Contains(sqlState) &&
            e.Level == (sqlState == "42501" ? LogLevel.Critical : status == 500 ? LogLevel.Error : LogLevel.Warning));
        Assert.DoesNotContain(factory.Logs.Entries, e => e.Text.Contains(ErrorProbeController.SensitiveMarker));
    }

    [Fact]
    public async Task SolicitudCanceladaPorElClienteNoSeRegistraComoError()
    {
        await using var factory = new ApiDePrueba();
        using var client = factory.Client();
        using var cancelacion = new CancellationTokenSource(TimeSpan.FromMilliseconds(300));

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => client.GetAsync("/__test/errors/slow", cancelacion.Token));

        await ErrorProbeController.SlowFinished.Task.WaitAsync(TimeSpan.FromSeconds(10), Ct);
        await Task.Delay(500, Ct); // el middleware de errores corre después del finally del controller
        Assert.DoesNotContain(factory.Logs.Entries, e => e.Level >= LogLevel.Error);
    }

    [Fact]
    public void CadenaSinPostgresNoProduceCoincidencia()
    {
        Assert.Null(PostgresExceptionMapper.Find(null));
        Assert.Null(PostgresExceptionMapper.Find(new Exception("outer", new Exception("inner"))));
        Assert.False(PostgresExceptionMapper.IsDatabaseUnavailable(null));
        Assert.False(PostgresExceptionMapper.IsDatabaseUnavailable(new Exception("outer", new Exception("inner"))));
    }

    [Fact]
    public void SoloNpgsqlSinSqlStateCuentaComoBaseDeDatosNoDisponible()
    {
        var sinRespuesta = new NpgsqlException("connect", new TimeoutException());
        var conRespuesta = new PostgresException("x", "ERROR", "ERROR", "23505");

        Assert.True(PostgresExceptionMapper.IsDatabaseUnavailable(new Exception("outer", sinRespuesta)));
        Assert.False(PostgresExceptionMapper.IsDatabaseUnavailable(new Exception("outer", conRespuesta)));
    }

    [Fact]
    public async Task BaseDeDatosInaccesibleDevuelve503()
    {
        // La fábrica apunta a 127.0.0.1:1, donde no escucha nadie: la consulta falla de verdad.
        await using var factory = new ApiDePrueba();
        using var client = factory.Client();

        using var response = await client.GetAsync("/__test/errors/database-unavailable", Ct);

        await AssertProblem(response, 503);
        Assert.Contains(factory.Logs.Entries, e => e.Level == LogLevel.Error && e.Text.Contains("HTTP: 503"));
    }

    [Theory]
    [InlineData("Development", "http://localhost:5173", true)]
    [InlineData("Development", "http://127.0.0.1:5173", true)]
    [InlineData("Development", "https://no-autorizado.example", false)]
    [InlineData("Production", "http://localhost:5173", false)]
    [InlineData("Production", "http://127.0.0.1:5173", false)]
    public async Task CorsSoloPermiteOrigenesConfigurados(string environment, string origin, bool allowed)
    {
        await using var factory = new ApiDePrueba(environment);
        using var client = factory.Client();
        // La llamada real del frontend lleva Bearer y JSON hacia un endpoint protegido.
        using var request = new HttpRequestMessage(HttpMethod.Options, "/api/users");
        request.Headers.Add("Origin", origin);
        request.Headers.Add("Access-Control-Request-Method", "POST");
        request.Headers.Add("Access-Control-Request-Headers", "authorization,content-type");
        using var response = await client.SendAsync(request, Ct);
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(allowed, response.Headers.Contains("Access-Control-Allow-Origin"));
        if (allowed)
        {
            Assert.Equal(origin, Assert.Single(response.Headers.GetValues("Access-Control-Allow-Origin")));
            Assert.Contains("POST", response.Headers.GetValues("Access-Control-Allow-Methods"));
            var headers = string.Join(",", response.Headers.GetValues("Access-Control-Allow-Headers"));
            Assert.Contains("authorization", headers, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("content-type", headers, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Theory]
    [InlineData("Development", 200)]
    // En Production no existen: como toda ruta sin endpoint, una solicitud anónima recibe 401
    // (política de autorización por defecto), no el documento.
    [InlineData("Production", 401)]
    public async Task SwaggerYOpenApiSoloExistenEnDesarrollo(string environment, int status)
    {
        await using var factory = new ApiDePrueba(environment);
        using var client = factory.Client();
        using var swagger = await client.GetAsync("/swagger/index.html", Ct);
        Assert.Equal(status, (int)swagger.StatusCode);
        using var response = await client.GetAsync("/openapi/v1.json", Ct);
        Assert.Equal(status, (int)response.StatusCode);
        if (status == 200)
        {
            using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(Ct));
            var info = document.RootElement.GetProperty("info");
            Assert.Equal("Paqueteria API", info.GetProperty("title").GetString());
            Assert.Equal("API REST del Sistema de Gestión de Paquetería", info.GetProperty("description").GetString());
            Assert.Equal("v1", info.GetProperty("version").GetString());
            Assert.True(document.RootElement.GetProperty("paths").TryGetProperty("/health", out _));
            Assert.True(document.RootElement.GetProperty("components").GetProperty("schemas").TryGetProperty("HealthResponse", out _));
            var bearer = document.RootElement.GetProperty("components").GetProperty("securitySchemes").GetProperty("Bearer");
            Assert.Equal("http", bearer.GetProperty("type").GetString());
            Assert.Equal("bearer", bearer.GetProperty("scheme").GetString());
        }
    }

    [Fact]
    public async Task OpenApiDocumentaEnumsComoCodigosDeTexto()
    {
        await using var factory = new ApiDePrueba("Development");
        using var client = factory.Client();
        using var response = await client.GetAsync("/openapi/v1.json", Ct);
        response.EnsureSuccessStatusCode();
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(Ct));
        var schemas = document.RootElement.GetProperty("components").GetProperty("schemas");

        var estadoEmbarque = schemas.GetProperty("EstadoEmbarque");
        Assert.Equal("string", estadoEmbarque.GetProperty("type").GetString());
        Assert.Equal(["ABIERTO", "CERRADO", "EN_TRANSITO", "RECIBIDO", "CANCELADO"],
            estadoEmbarque.GetProperty("enum").EnumerateArray().Select(value => value.GetString()));

        var estadoAgencia = schemas.GetProperty("EstadoAgencia");
        Assert.Equal("string", estadoAgencia.GetProperty("type").GetString());
        Assert.Equal(["ACTIVA", "SUSPENDIDA"],
            estadoAgencia.GetProperty("enum").EnumerateArray().Select(value => value.GetString()));
    }

    [Fact]
    public async Task FaltaDeConexionImpideElArranque()
    {
        await using var factory = new ApiDePrueba(connection: "");
        var exception = Assert.Throws<InvalidOperationException>(() => factory.Client());
        Assert.Contains("ConnectionStrings:Paqueteria", exception.Message);
        Assert.Contains(factory.Logs.Entries, e => e.Level == LogLevel.Critical);
    }

    [Fact]
    public async Task CorsConComodinImpideElArranque()
    {
        await using var factory = new ApiDePrueba(origin: "*");
        var exception = Assert.Throws<InvalidOperationException>(() => factory.Client());
        Assert.Contains("Cors:AllowedOrigins", exception.Message);
    }

    [Fact]
    public async Task SinAuthIssuerFueraDeDesarrolloImpideElArranque()
    {
        await using var factory = new ApiDePrueba(issuer: null);
        var exception = Assert.Throws<InvalidOperationException>(() => factory.Client());
        Assert.Contains("Auth:Issuer", exception.Message);
        Assert.Contains(factory.Logs.Entries, e => e.Level == LogLevel.Critical);
    }

    [Fact]
    public async Task AuthIssuerSinHttpsImpideElArranque()
    {
        await using var factory = new ApiDePrueba(issuer: "http://inseguro.test/auth/v1");
        var exception = Assert.Throws<InvalidOperationException>(() => factory.Client());
        Assert.Contains("HTTPS", exception.Message);
    }

    [Fact]
    public async Task SinAuthIssuerEnDesarrolloArrancaPeroRechazaTodoToken()
    {
        await using var factory = new ApiDePrueba("Development", issuer: null);
        using var anonimo = factory.Client();
        using var health = await anonimo.GetAsync("/health", Ct);
        Assert.Equal(HttpStatusCode.OK, health.StatusCode);
        Assert.Contains(factory.Logs.Entries, e => e.Level == LogLevel.Warning && e.Text.Contains("Auth:Issuer"));

        using var conToken = factory.Client(TokensDePrueba.Crear(Guid.NewGuid()));
        using var me = await conToken.GetAsync("/api/me", Ct);
        Assert.Equal(HttpStatusCode.Unauthorized, me.StatusCode);
    }

    private static async Task AssertProblem(HttpResponseMessage response, int status)
    {
        Assert.Equal(status, (int)response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var body = await response.Content.ReadAsStringAsync(Ct);
        using var document = JsonDocument.Parse(body);
        Assert.Equal(status, document.RootElement.GetProperty("status").GetInt32());
        Assert.False(string.IsNullOrWhiteSpace(document.RootElement.GetProperty("title").GetString()));
        var seccion = status switch { 400 => "15.5.1", 409 => "15.5.10", 503 => "15.6.4", _ => "15.6.1" };
        Assert.Equal($"https://tools.ietf.org/html/rfc9110#section-{seccion}", document.RootElement.GetProperty("type").GetString());
        Assert.False(string.IsNullOrWhiteSpace(document.RootElement.GetProperty("traceId").GetString()));
        Assert.DoesNotContain(ErrorProbeController.SensitiveMarker, body);
        Assert.False(document.RootElement.TryGetProperty("exception", out _));
        Assert.False(document.RootElement.TryGetProperty("detail", out _));
    }

}

// Este controller solo se carga en el host de tests. No agrega endpoints a la API publicada.
// Es anónimo para probar el manejo de errores sin depender de la autenticación.
[ApiController]
[AllowAnonymous]
[Route("__test/errors")]
public sealed class ErrorProbeController : ControllerBase
{
    public const string SensitiveMarker = "SENSITIVE_TEST_MARKER";

    public static TaskCompletionSource SlowFinished { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

    [HttpGet("unexpected")]
    public IActionResult Unexpected() => throw new InvalidOperationException(SensitiveMarker);

    [HttpGet("database-unavailable")]
    public async Task<IActionResult> DatabaseUnavailable([FromServices] PaqueteriaDbContext db) =>
        Ok(await db.Clientes.AnyAsync(HttpContext.RequestAborted));

    [HttpGet("slow")]
    public async Task<IActionResult> Slow()
    {
        try
        {
            await Task.Delay(Timeout.Infinite, HttpContext.RequestAborted);
            return Ok();
        }
        finally
        {
            SlowFinished.TrySetResult();
        }
    }

    [HttpGet("{sqlState}")]
    public IActionResult Postgres(string sqlState) => throw new Exception(SensitiveMarker,
        new DbUpdateException(SensitiveMarker, new PostgresException(SensitiveMarker, "ERROR", "ERROR", sqlState)));
}
