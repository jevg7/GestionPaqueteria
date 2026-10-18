using System.ComponentModel.DataAnnotations;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.DTOs;

/// <summary>Datos de una agencia, iguales para crearla y editarla.</summary>
public sealed record AgencyRequest(
    [Required(ErrorMessage = "El nombre de la agencia es obligatorio.")]
    [MaxLength(150, ErrorMessage = "El nombre admite hasta 150 caracteres.")]
    string Nombre,
    [MaxLength(30, ErrorMessage = "El RUC admite hasta 30 caracteres.")]
    string? Ruc,
    [MaxLength(254, ErrorMessage = "El correo de contacto admite hasta 254 caracteres.")]
    string? CorreoContacto,
    [MaxLength(30, ErrorMessage = "El teléfono admite hasta 30 caracteres.")]
    [RegularExpression(@"^\s*\+?[0-9 ()\-]*[0-9][0-9 ()\-]*\s*$",
        ErrorMessage = "El teléfono solo admite dígitos, espacios, guiones, paréntesis y un + inicial.")]
    string? Telefono) : IValidatableObject
{
    // [EmailAddress] rechaza "", y un campo vacío del formulario debe guardarse como null.
    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (!string.IsNullOrWhiteSpace(CorreoContacto) && !new EmailAddressAttribute().IsValid(CorreoContacto.Trim()))
        {
            yield return new ValidationResult("El correo de contacto no tiene un formato válido.", [nameof(CorreoContacto)]);
        }
    }
}

/// <summary>
/// Alta de una agencia por el dueño de la plataforma, con su primer ADMIN, que recibe la invitación por
/// correo. La agencia nace con las ubicaciones MIA y MGA y la ruta Miami → Managua; las tarifas las
/// define su ADMIN.
/// </summary>
public sealed record CreateAgencyRequest(
    [Required(ErrorMessage = "Indique los datos de la agencia.")]
    AgencyRequest Agencia,
    [Required(ErrorMessage = "Indique el primer administrador de la agencia.")]
    AgencyAdminRequest Admin);

public sealed record AgencyAdminRequest(
    [Required(ErrorMessage = "Los nombres del administrador son obligatorios.")]
    [MaxLength(100, ErrorMessage = "Los nombres admiten hasta 100 caracteres.")]
    string Nombres,
    [Required(ErrorMessage = "Los apellidos del administrador son obligatorios.")]
    [MaxLength(100, ErrorMessage = "Los apellidos admiten hasta 100 caracteres.")]
    string Apellidos,
    [Required(ErrorMessage = "El correo del administrador es obligatorio: ahí llega la invitación.")]
    [MaxLength(254, ErrorMessage = "El correo admite hasta 254 caracteres.")]
    [EmailAddress(ErrorMessage = "El correo del administrador no tiene un formato válido.")]
    string Correo,
    [MaxLength(30, ErrorMessage = "El teléfono admite hasta 30 caracteres.")]
    [RegularExpression(@"^\s*\+?[0-9 ()\-]*[0-9][0-9 ()\-]*\s*$",
        ErrorMessage = "El teléfono solo admite dígitos, espacios, guiones, paréntesis y un + inicial.")]
    string? Telefono);

public sealed record AgencyResponse(
    long Id,
    string Nombre,
    string? Ruc,
    string? CorreoContacto,
    string? Telefono,
    EstadoAgencia Estado,
    DateTimeOffset CreadoEn,
    DateTimeOffset ActualizadoEn);

/// <summary>Filtros de GET /api/platform/agencies.</summary>
public sealed class AgencySearchQuery
{
    /// <summary>Busca en nombre, RUC y correo de contacto.</summary>
    [MaxLength(100, ErrorMessage = "La búsqueda admite hasta 100 caracteres.")]
    public string? Search { get; init; }

    public EstadoAgencia? Estado { get; init; }

    [Range(1, int.MaxValue, ErrorMessage = "page empieza en 1.")]
    public int Page { get; init; } = 1;

    [Range(1, 100, ErrorMessage = "pageSize debe estar entre 1 y 100.")]
    public int PageSize { get; init; } = 20;
}
