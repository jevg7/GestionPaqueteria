using System.ComponentModel.DataAnnotations;

namespace Paqueteria.Api.DTOs;

/// <summary>
/// Alta de un empleado. La API lo invita por correo (Supabase Auth): el invitado define su contraseña
/// desde el enlace. El correo identifica a la persona en toda la plataforma y no se puede cambiar.
/// </summary>
public sealed record CreateUserRequest(
    [Required(ErrorMessage = "Los nombres son obligatorios.")]
    [MaxLength(100, ErrorMessage = "Los nombres admiten hasta 100 caracteres.")]
    string Nombres,
    [Required(ErrorMessage = "Los apellidos son obligatorios.")]
    [MaxLength(100, ErrorMessage = "Los apellidos admiten hasta 100 caracteres.")]
    string Apellidos,
    [Required(ErrorMessage = "El correo es obligatorio: ahí llega la invitación.")]
    [MaxLength(254, ErrorMessage = "El correo admite hasta 254 caracteres.")]
    [EmailAddress(ErrorMessage = "El correo no tiene un formato válido.")]
    string Correo,
    [MaxLength(30, ErrorMessage = "El teléfono admite hasta 30 caracteres.")]
    [RegularExpression(@"^\s*\+?[0-9 ()\-]*[0-9][0-9 ()\-]*\s*$",
        ErrorMessage = "El teléfono solo admite dígitos, espacios, guiones, paréntesis y un + inicial.")]
    string? Telefono,
    [Required(ErrorMessage = "Indique al menos un rol.")]
    [MinLength(1, ErrorMessage = "Indique al menos un rol.")]
    IReadOnlyList<string> Roles);

/// <summary>Datos editables de un empleado (PUT): reemplaza nombres, teléfono y roles.</summary>
public sealed record UpdateUserRequest(
    [Required(ErrorMessage = "Los nombres son obligatorios.")]
    [MaxLength(100, ErrorMessage = "Los nombres admiten hasta 100 caracteres.")]
    string Nombres,
    [Required(ErrorMessage = "Los apellidos son obligatorios.")]
    [MaxLength(100, ErrorMessage = "Los apellidos admiten hasta 100 caracteres.")]
    string Apellidos,
    [MaxLength(30, ErrorMessage = "El teléfono admite hasta 30 caracteres.")]
    [RegularExpression(@"^\s*\+?[0-9 ()\-]*[0-9][0-9 ()\-]*\s*$",
        ErrorMessage = "El teléfono solo admite dígitos, espacios, guiones, paréntesis y un + inicial.")]
    string? Telefono,
    [Required(ErrorMessage = "Indique al menos un rol.")]
    [MinLength(1, ErrorMessage = "Indique al menos un rol.")]
    IReadOnlyList<string> Roles);

public sealed record UserResponse(
    long Id,
    string Nombres,
    string Apellidos,
    string Correo,
    string? Telefono,
    bool Activo,
    IReadOnlyList<string> Roles,
    DateTimeOffset CreadoEn,
    DateTimeOffset ActualizadoEn);

/// <summary>Filtros de GET /api/users.</summary>
public sealed class UserSearchQuery
{
    /// <summary>Busca en nombre completo y correo.</summary>
    [MaxLength(100, ErrorMessage = "La búsqueda admite hasta 100 caracteres.")]
    public string? Search { get; init; }

    /// <summary>true = solo activos, false = solo inactivos, vacío = todos.</summary>
    public bool? Activo { get; init; }

    /// <summary>Solo los que tienen este rol (ADMIN, AGENTE, BODEGA, REPARTIDOR).</summary>
    public string? Rol { get; init; }

    [Range(1, int.MaxValue, ErrorMessage = "page empieza en 1.")]
    public int Page { get; init; } = 1;

    [Range(1, 100, ErrorMessage = "pageSize debe estar entre 1 y 100.")]
    public int PageSize { get; init; } = 20;
}

/// <summary>Rol que el ADMIN puede asignar, para el formulario de usuarios.</summary>
public sealed record RoleResponse(string Codigo, string Nombre, string? Descripcion);
