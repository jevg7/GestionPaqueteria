using System.Globalization;
using System.Security.Claims;

namespace Paqueteria.Api.Auth;

/// <summary>
/// Quién hace la solicitud: un empleado de una agencia (<see cref="Id"/>, <see cref="AgenciaId"/>) o
/// un dueño de la plataforma (<see cref="PlataformaId"/>).
/// </summary>
public sealed class UsuarioActual(IHttpContextAccessor httpContextAccessor)
{
    private ClaimsPrincipal Principal =>
        httpContextAccessor.HttpContext?.User ?? throw new InvalidOperationException("No hay una solicitud HTTP en curso.");

    /// <summary>usuarios.id del empleado, para las columnas *_usuario_id. Las políticas garantizan que exista.</summary>
    public long Id => Leer(ClaimsPaqueteria.UsuarioId)
        ?? throw new InvalidOperationException("La solicitud no tiene un empleado activo de una agencia.");

    /// <summary>Agencia del empleado. La BD la toma de la sesión; el código no la necesita para filtrar.</summary>
    public long AgenciaId => Leer(ClaimsPaqueteria.AgenciaId)
        ?? throw new InvalidOperationException("La solicitud no tiene una agencia.");

    /// <summary>usuarios_plataforma.id si quien llama es un dueño de la plataforma.</summary>
    public long? PlataformaId => Leer(ClaimsPaqueteria.PlataformaId);

    public IReadOnlyList<string> Roles =>
        Principal.FindAll(ClaimsPaqueteria.Rol).Select(c => c.Value).Order(StringComparer.Ordinal).ToList();

    private long? Leer(string claim) =>
        long.TryParse(Principal.FindFirstValue(claim), NumberStyles.None, CultureInfo.InvariantCulture, out var valor)
            ? valor
            : null;
}
