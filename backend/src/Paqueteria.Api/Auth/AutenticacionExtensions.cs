using System.Data;
using System.Globalization;
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
using Npgsql;
using Paqueteria.Api.Data;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.Auth;

/// <summary>Sección Plataforma de la configuración.</summary>
public sealed class PlataformaOptions
{
    public const string Seccion = "Plataforma";

    /// <summary>
    /// Correos de los dueños de la plataforma. Al iniciar sesión con uno de ellos por primera vez se
    /// crea su usuario de plataforma (sin SQL). Requiere confirmación de correo activa en Supabase.
    /// </summary>
    public string[] Propietarios { get; set; } = [];
}

public static class Politicas
{
    /// <summary>Token válido, aunque no dé acceso a datos (GET /api/me explica por qué).</summary>
    public const string TokenValido = "TokenValido";
}

public static class AutenticacionExtensions
{
    /// <summary>
    /// Autenticación con los JWT de Supabase Auth (claves asimétricas, JWKS) y autorización por
    /// defecto: todo endpoint exige un empleado activo de una agencia activa, salvo los marcados con
    /// AllowAnonymous (/health, OpenAPI) o con otra política (plataforma, /api/me).
    /// </summary>
    public static IServiceCollection AddAutenticacionSupabase(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<SupabaseAuthOptions>(configuration.GetSection(SupabaseAuthOptions.Seccion));
        services.Configure<PlataformaOptions>(configuration.GetSection(PlataformaOptions.Seccion));
        services.AddHttpClient(SupabaseAuthOptions.JwksHttpClient);
        services.AddHttpContextAccessor();
        services.AddScoped<UsuarioActual>();

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer();
        services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
            .Configure<IOptions<SupabaseAuthOptions>, IHttpClientFactory>(
                (jwt, auth, httpClientFactory) => Configurar(jwt, auth.Value, httpClientFactory));

        var empleadoActivo = new AuthorizationPolicyBuilder()
            .RequireAuthenticatedUser()
            .RequireClaim(ClaimsPaqueteria.UsuarioId)
            .RequireClaim(ClaimsPaqueteria.AgenciaId)
            .Build();
        services.AddAuthorizationBuilder()
            .SetDefaultPolicy(empleadoActivo)
            .SetFallbackPolicy(empleadoActivo)
            .AddPolicy(Politicas.TokenValido, politica => politica.RequireAuthenticatedUser());

        return services;
    }

    private static void Configurar(JwtBearerOptions jwt, SupabaseAuthOptions auth, IHttpClientFactory httpClientFactory)
    {
        jwt.MapInboundClaims = false;
        jwt.TokenValidationParameters = new TokenValidationParameters
        {
            // Sin Auth:Issuer (solo se permite en Development) ningún token es válido.
            ValidateIssuer = true,
            ValidIssuer = auth.Configurado ? auth.Issuer : "auth-no-configurado",
            ValidateAudience = true,
            ValidAudience = auth.Audience,
            ValidateLifetime = true,
            RequireExpirationTime = true,
            RequireSignedTokens = true,
            // Solo algoritmos asimétricos: un token HS256 no se acepta aunque alguien conozca un secreto.
            ValidAlgorithms = [SecurityAlgorithms.EcdsaSha256, SecurityAlgorithms.RsaSha256],
            NameClaimType = "sub",
            RoleClaimType = ClaimsPaqueteria.Rol,
        };

        if (auth.Configurado)
        {
            var retriever = new HttpDocumentRetriever(httpClientFactory.CreateClient(SupabaseAuthOptions.JwksHttpClient))
            {
                RequireHttps = true,
            };
            jwt.ConfigurationManager = new ConfigurationManager<OpenIdConnectConfiguration>(
                auth.JwksUrlEfectiva, new JwksRetriever(auth.Issuer!), retriever);
        }

        jwt.Events = new JwtBearerEvents { OnTokenValidated = CargarUsuarioAsync };
    }

    /// <summary>
    /// Token válido: identifica al usuario por auth_user_id (= "sub") con fn_identificar_usuario (la
    /// agencia todavía no se conoce, así que RLS no dejaría leer usuarios) y agrega sus claims. Si no
    /// tiene acceso, agrega solo el motivo y la política responde 403. Si la BD falla, la excepción
    /// sigue su curso y el manejador global responde 503.
    /// </summary>
    private static async Task CargarUsuarioAsync(TokenValidatedContext context)
    {
        if (context.Principal?.Identity is not ClaimsIdentity identidad)
        {
            return;
        }

        // Estos claims solo los pone la API: se descartan si vinieran dentro del token.
        foreach (var claim in identidad.FindAll(c => ClaimsPaqueteria.Todos.Contains(c.Type)).ToList())
        {
            identidad.RemoveClaim(claim);
        }

        if (!Guid.TryParse(identidad.FindFirst("sub")?.Value, out var authUserId))
        {
            return;
        }

        var servicios = context.HttpContext.RequestServices;
        var db = servicios.GetRequiredService<PaqueteriaDbContext>();
        var cancelacion = context.HttpContext.RequestAborted;
        var encontrado = await IdentificarAsync(db, authUserId, cancelacion)
            ?? await CrearPropietarioSiCorrespondeAsync(db, identidad, authUserId, servicios, cancelacion);

        var logger = servicios.GetRequiredService<ILoggerFactory>().CreateLogger(typeof(AutenticacionExtensions).FullName!);
        string? sinAcceso = encontrado switch
        {
            null => EstadosAcceso.SinCuenta,
            { Activo: false } => EstadosAcceso.UsuarioInactivo,
            { Tipo: "AGENCIA", AgenciaEstado: "SUSPENDIDA" } => EstadosAcceso.AgenciaSuspendida,
            _ => null,
        };
        if (sinAcceso is not null)
        {
            identidad.AddClaim(new Claim(ClaimsPaqueteria.EstadoAcceso, sinAcceso));
            logger.LogWarning("Token válido sin acceso ({Motivo}). Sub: {Sub}; TraceId: {TraceId}.",
                sinAcceso, authUserId, context.HttpContext.TraceIdentifier);
            return;
        }

        var usuario = encontrado!;
        if (usuario.Tipo == "PLATAFORMA")
        {
            identidad.AddClaim(new Claim(ClaimsPaqueteria.PlataformaId, usuario.UsuarioId.ToString(CultureInfo.InvariantCulture)));
            identidad.AddClaim(new Claim(ClaimsPaqueteria.Rol, CodigosRol.Plataforma));
            return;
        }

        identidad.AddClaim(new Claim(ClaimsPaqueteria.UsuarioId, usuario.UsuarioId.ToString(CultureInfo.InvariantCulture)));
        identidad.AddClaim(new Claim(ClaimsPaqueteria.AgenciaId, usuario.AgenciaId!.Value.ToString(CultureInfo.InvariantCulture)));
        foreach (var rol in usuario.Roles)
        {
            identidad.AddClaim(new Claim(ClaimsPaqueteria.Rol, rol));
        }
    }

    private sealed record Identidad(string Tipo, long UsuarioId, long? AgenciaId, bool Activo, string? AgenciaEstado, string[] Roles);

    private static async Task<Identidad?> IdentificarAsync(PaqueteriaDbContext db, Guid authUserId, CancellationToken cancellationToken)
    {
        // La conexión se cierra al terminar: al volver a abrirse para la solicitud, el interceptor
        // fijará la agencia y el usuario que ahora se van a conocer.
        await db.Database.OpenConnectionAsync(cancellationToken);
        try
        {
            await using var comando = db.Database.GetDbConnection().CreateCommand();
            comando.CommandText =
                "select tipo, usuario_id, agencia_id, activo, agencia_estado, roles from paqueteria.fn_identificar_usuario(@sub)";
            comando.Parameters.Add(new NpgsqlParameter("sub", authUserId));
            await using var lector = await comando.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
            if (!await lector.ReadAsync(cancellationToken))
            {
                return null;
            }
            return new Identidad(
                lector.GetString(0),
                lector.GetInt64(1),
                lector.IsDBNull(2) ? null : lector.GetInt64(2),
                lector.GetBoolean(3),
                lector.IsDBNull(4) ? null : lector.GetString(4),
                lector.GetFieldValue<string[]>(5));
        }
        finally
        {
            await db.Database.CloseConnectionAsync();
        }
    }

    /// <summary>
    /// Primer inicio de sesión de un dueño de la plataforma listado en Plataforma:Propietarios: crea su
    /// usuario de plataforma. El correo del token es confiable porque Supabase exige confirmarlo.
    /// </summary>
    private static async Task<Identidad?> CrearPropietarioSiCorrespondeAsync(
        PaqueteriaDbContext db, ClaimsIdentity identidad, Guid authUserId, IServiceProvider servicios, CancellationToken cancellationToken)
    {
        var correo = identidad.FindFirst("email")?.Value?.Trim();
        var propietarios = servicios.GetRequiredService<IOptions<PlataformaOptions>>().Value.Propietarios;
        if (string.IsNullOrEmpty(correo) || !propietarios.Contains(correo, StringComparer.OrdinalIgnoreCase))
        {
            return null;
        }

        var propietario = new UsuarioPlataforma
        {
            AuthUserId = authUserId,
            Nombres = "Propietario",
            Apellidos = "de la plataforma",
            Correo = correo,
        };
        db.UsuariosPlataforma.Add(propietario);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            // Otra solicitud del mismo primer inicio de sesión lo creó antes (o el correo ya es de otra
            // cuenta de Supabase: entonces no hay acceso).
            db.ChangeTracker.Clear();
            return await IdentificarAsync(db, authUserId, cancellationToken);
        }
        db.ChangeTracker.Clear();

        servicios.GetRequiredService<ILoggerFactory>().CreateLogger(typeof(AutenticacionExtensions).FullName!)
            .LogInformation("Dueño de la plataforma {PlataformaId} creado en su primer inicio de sesión.", propietario.Id);
        return new Identidad("PLATAFORMA", propietario.Id, null, true, null, [CodigosRol.Plataforma]);
    }
}
