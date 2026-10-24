using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Options;
using Microsoft.OpenApi;
using Paqueteria.Api.Auth;
using Paqueteria.Api.Data;
using Paqueteria.Api.Middleware;
using Paqueteria.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// CreateBuilder agrega los proveedores estándar de logging.
// EF puede registrar SQL y mensajes sensibles aun sin EnableSensitiveDataLogging.
// El manejador global registra los errores de forma sanitizada.
builder.Logging.AddFilter("Microsoft.EntityFrameworkCore", LogLevel.None);

// Usuario de la API; el dueño y las migraciones se usan solo fuera de este proceso.
var connectionString = builder.Configuration.GetConnectionString(ConnectionStringNames.Api);
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];

// El interceptor pasa a la BD la agencia (RLS) y quién hace cada cambio (auditoría) en cada conexión.
builder.Services.AddSingleton<ContextoSesionInterceptor>();
builder.Services.AddDbContext<PaqueteriaDbContext>((services, options) => PaqueteriaDbContext
    .Configurar(options, connectionString)
    .AddInterceptors(services.GetRequiredService<ContextoSesionInterceptor>()));
builder.Services.AddScoped<ClientesService>();
builder.Services.AddScoped<PaquetesService>();
builder.Services.AddScoped<EmbarquesService>();
builder.Services.AddScoped<TiposCambioService>();
builder.Services.AddScoped<FacturacionService>();
builder.Services.AddScoped<EntregasService>();
// Invitaciones de usuarios con la API de administración de Supabase Auth.
builder.Services.Configure<SupabaseAdminOptions>(builder.Configuration.GetSection(SupabaseAdminOptions.Seccion));
builder.Services.AddHttpClient(SupabaseAdminOptions.HttpClient, client => client.Timeout = TimeSpan.FromSeconds(15));
builder.Services.AddScoped<InvitacionesSupabase>();
builder.Services.AddScoped<UsuariosService>();
builder.Services.AddScoped<AgenciasService>();
builder.Services.AddScoped<TarifasService>();
builder.Services.AddScoped<UbicacionesService>();
builder.Services.AddSingleton(TimeProvider.System);

// Los enums viajan en JSON con el mismo código que en la BD: EnTransito <-> "EN_TRANSITO".
builder.Services.AddControllers().AddJsonOptions(options =>
    options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseUpper)));
builder.Services.AddProblemDetails(options => options.CustomizeProblemDetails = context =>
    context.ProblemDetails.Extensions["traceId"] = context.HttpContext.TraceIdentifier);
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
// En producción la API corre detrás de Nginx en el mismo servidor (docs/despliegue.md): así ve el esquema (https) y la
// IP del cliente. Solo se aceptan esas cabeceras de loopback (KnownProxies por defecto), es decir, del Nginx local.
builder.Services.Configure<ForwardedHeadersOptions>(options =>
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto);
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod()));
// JWT de Supabase Auth. Todo endpoint exige un empleado activo salvo los marcados AllowAnonymous.
builder.Services.AddAutenticacionSupabase(builder.Configuration);
builder.Services.AddOpenApi("v1", options => options.AddDocumentTransformer((document, context, ct) =>
{
    document.Info.Title = "Paqueteria API";
    document.Info.Description = "API REST del Sistema de Gestión de Paquetería";
    document.Info.Version = "v1";

    // Botón "Authorize" de Swagger UI: pegar el access_token de Supabase.
    document.Components ??= new OpenApiComponents();
    document.Components.SecuritySchemes ??= new Dictionary<string, IOpenApiSecurityScheme>();
    document.Components.SecuritySchemes["Bearer"] = new OpenApiSecurityScheme
    {
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        Description = "access_token de una sesión de Supabase Auth.",
    };
    document.Security = [new OpenApiSecurityRequirement { [new OpenApiSecuritySchemeReference("Bearer", document)] = [] }];
    return Task.CompletedTask;
}));

var app = builder.Build();

if (string.IsNullOrWhiteSpace(connectionString))
{
    app.Logger.LogCritical("Falta la configuración ConnectionStrings:Paqueteria.");
    throw new InvalidOperationException(
        "Falta ConnectionStrings:Paqueteria. Configúrela con user-secrets o ConnectionStrings__Paqueteria.");
}

if (allowedOrigins.Any(origin =>
    !Uri.TryCreate(origin, UriKind.Absolute, out var uri) ||
    (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps) ||
    uri.Authority.Contains('*') || !string.IsNullOrEmpty(uri.UserInfo) ||
    origin != uri.GetLeftPart(UriPartial.Authority)))
{
    app.Logger.LogCritical("Cors:AllowedOrigins debe contener orígenes HTTP/HTTPS sin rutas, credenciales ni comodines.");
    throw new InvalidOperationException("Configuración inválida de Cors:AllowedOrigins.");
}

if (allowedOrigins.Length == 0)
{
    app.Logger.LogWarning("Cors:AllowedOrigins está vacío; no se permiten solicitudes CORS de otros orígenes.");
}

var auth = app.Services.GetRequiredService<IOptions<SupabaseAuthOptions>>().Value;
if (auth.Validar() is { } errorAuth)
{
    app.Logger.LogCritical("Configuración inválida de autenticación: {Error}", errorAuth);
    throw new InvalidOperationException(errorAuth);
}
if (!auth.Configurado)
{
    // Development puede arrancar sin Supabase (para /health, Swagger y la BD local); ningún token será válido.
    if (!app.Environment.IsDevelopment())
    {
        app.Logger.LogCritical("Falta la configuración Auth:Issuer.");
        throw new InvalidOperationException("Falta Auth:Issuer (https://<proyecto>.supabase.co/auth/v1).");
    }
    app.Logger.LogWarning("Auth:Issuer no está configurado: todas las solicitudes a /api responderán 401.");
}

var supabase = app.Services.GetRequiredService<IOptions<SupabaseAdminOptions>>().Value;
if (supabase.Validar() is { } errorSupabase)
{
    app.Logger.LogCritical("Configuración inválida de Supabase: {Error}", errorSupabase);
    throw new InvalidOperationException(errorSupabase);
}
if (!supabase.Configurado)
{
    // La API funciona, pero no se pueden crear usuarios ni agencias (responden 503).
    app.Logger.LogWarning("Supabase:Url o Supabase:ServiceRoleKey no están configurados: no se pueden enviar invitaciones.");
}

app.UseForwardedHeaders();
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseHttpsRedirection();
app.UseRouting();
app.UseCors();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi().AllowAnonymous();
    app.UseSwaggerUI(options => options.SwaggerEndpoint("../openapi/v1.json", "Paqueteria API v1"));
}

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapGet("/health", () => TypedResults.Ok(new HealthResponse("ok")))
    .AllowAnonymous()
    .WithName("Health")
    .WithSummary("Comprueba que la API está funcionando sin consultar la base de datos.");

app.Lifetime.ApplicationStarted.Register(() => app.Logger.LogInformation("Paqueteria API iniciada."));
app.Run();

public sealed record HealthResponse(string Status);

// Permite probar el pipeline real con WebApplicationFactory sin abrir un puerto.
public partial class Program;
