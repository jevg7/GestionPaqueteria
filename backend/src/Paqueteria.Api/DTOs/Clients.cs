using System.ComponentModel.DataAnnotations;

namespace Paqueteria.Api.DTOs;

/// <summary>
/// Datos de un cliente, iguales para crear (POST) y reemplazar (PUT). Los textos se recortan
/// antes de guardar; correo y dirección vacíos se guardan como null.
/// </summary>
public sealed record ClientRequest(
    [Required(ErrorMessage = "Los nombres son obligatorios.")]
    [MaxLength(100, ErrorMessage = "Los nombres admiten hasta 100 caracteres.")]
    string Nombres,
    [Required(ErrorMessage = "Los apellidos son obligatorios.")]
    [MaxLength(100, ErrorMessage = "Los apellidos admiten hasta 100 caracteres.")]
    string Apellidos,
    [Required(ErrorMessage = "El teléfono es obligatorio: es el canal para notificar al cliente.")]
    [MaxLength(30, ErrorMessage = "El teléfono admite hasta 30 caracteres.")]
    [RegularExpression(@"^\s*\+?[0-9 ()\-]*[0-9][0-9 ()\-]*\s*$",
        ErrorMessage = "El teléfono solo admite dígitos, espacios, guiones, paréntesis y un + inicial.")]
    string Telefono,
    [MaxLength(254, ErrorMessage = "El correo admite hasta 254 caracteres.")]
    string? Correo,
    string? Direccion) : IValidatableObject
{
    // [EmailAddress] rechaza "", y un campo vacío del formulario debe guardarse como null.
    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (!string.IsNullOrWhiteSpace(Correo) && !new EmailAddressAttribute().IsValid(Correo.Trim()))
        {
            yield return new ValidationResult("El correo no tiene un formato válido.", [nameof(Correo)]);
        }
    }
}

public sealed record ClientResponse(
    long Id,
    string CodigoCliente,
    string Nombres,
    string Apellidos,
    string Telefono,
    string? Correo,
    string? Direccion,
    bool Activo,
    DateTimeOffset FechaRegistro,
    DateTimeOffset ActualizadoEn);

/// <summary>Filtros de GET /api/clients.</summary>
public sealed class ClientSearchQuery
{
    /// <summary>Busca en nombre completo, teléfono (solo dígitos), correo y código de cliente.</summary>
    [MaxLength(100, ErrorMessage = "La búsqueda admite hasta 100 caracteres.")]
    public string? Search { get; init; }

    /// <summary>true = solo activos, false = solo inactivos, vacío = todos.</summary>
    public bool? Activo { get; init; }

    [Range(1, int.MaxValue, ErrorMessage = "page empieza en 1.")]
    public int Page { get; init; } = 1;

    [Range(1, 100, ErrorMessage = "pageSize debe estar entre 1 y 100.")]
    public int PageSize { get; init; } = 20;
}

public sealed record PagedResponse<T>(IReadOnlyList<T> Items, int Page, int PageSize, int Total);
