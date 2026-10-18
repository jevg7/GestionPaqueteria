using System.Collections.Concurrent;
using System.Net.Http.Headers;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Paqueteria.Api.Auth;

namespace Paqueteria.IntegrationTests.Infrastructure;

/// <summary>
/// La API real en memoria (WebApplicationFactory), con Supabase Auth simulado por
/// <see cref="TokensDePrueba"/>. Por defecto apunta a 127.0.0.1:1, donde no escucha nadie:
/// los tests que necesitan BD pasan la cadena de su BD de prueba.
/// </summary>
public sealed class ApiDePrueba(
    string environment = "Production",
    string connection = "Host=127.0.0.1;Port=1;Database=not_used;Username=not_used",
    string? origin = null,
    string? issuer = TokensDePrueba.Issuer,
    IReadOnlyDictionary<string, string?>? settings = null) : WebApplicationFactory<Program>
{
    public LogsCapturados Logs { get; } = new();

    public SupabaseDePrueba Supabase { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(environment);
        builder.UseSetting("ConnectionStrings:Paqueteria", connection);
        builder.UseSetting("ConnectionStrings:PaqueteriaOwner", "");
        builder.UseSetting("Auth:Issuer", issuer ?? "");
        builder.UseSetting("Supabase:Url", SupabaseDePrueba.Url);
        builder.UseSetting("Supabase:ServiceRoleKey", SupabaseDePrueba.Clave);
        builder.UseSetting("Supabase:InviteRedirectUrl", SupabaseDePrueba.RedirectUrl);
        if (origin is not null)
        {
            builder.UseSetting("Cors:AllowedOrigins:0", origin);
        }
        foreach (var (clave, valor) in settings ?? new Dictionary<string, string?>())
        {
            builder.UseSetting(clave, valor);
        }
        builder.ConfigureLogging(logging => logging.AddProvider(Logs));
        builder.ConfigureServices(services =>
        {
            services.AddHttpClient(SupabaseAuthOptions.JwksHttpClient)
                .ConfigurePrimaryHttpMessageHandler(() => new JwksDePrueba());
            services.AddHttpClient(SupabaseAdminOptions.HttpClient)
                .ConfigurePrimaryHttpMessageHandler(Supabase.Handler);
            // Controllers de prueba (ErrorProbeController, RoleProbeController): solo en este host.
            services.AddControllers().AddApplicationPart(typeof(ApiDePrueba).Assembly);
        });
    }

    public HttpClient Client(string? token = null)
    {
        var client = CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            AllowAutoRedirect = false,
        });
        if (token is not null)
        {
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }
        return client;
    }
}

public sealed class LogsCapturados : ILoggerProvider
{
    public ConcurrentQueue<(LogLevel Level, string Text)> Entries { get; } = new();

    public ILogger CreateLogger(string categoryName) => new Capturador(Entries);

    public void Dispose()
    {
    }

    private sealed class Capturador(ConcurrentQueue<(LogLevel, string)> entries) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state,
            Exception? exception, Func<TState, Exception?, string> formatter) =>
            entries.Enqueue((logLevel, formatter(state, exception) + exception));
    }
}
