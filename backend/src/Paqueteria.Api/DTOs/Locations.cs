using System.ComponentModel.DataAnnotations;

namespace Paqueteria.Api.DTOs;

/// <summary>
/// Ubicación nueva: una bodega en EE. UU. (US) o una agencia en Nicaragua (NI). El código (MIA, MGA…)
/// se muestra en rutas y embarques y no cambia después.
/// </summary>
public sealed record CreateLocationRequest(
    [Required(ErrorMessage = "El código es obligatorio.")]
    [RegularExpression(@"^\s*[A-Za-z0-9]{2,10}\s*$", ErrorMessage = "El código tiene de 2 a 10 letras o dígitos, sin espacios.")]
    string Codigo,
    [Required(ErrorMessage = "El nombre es obligatorio.")]
    [MaxLength(100, ErrorMessage = "El nombre admite hasta 100 caracteres.")]
    string Nombre,
    [Required(ErrorMessage = "El país es obligatorio (US o NI).")]
    [RegularExpression(@"^\s*(US|NI|us|ni)\s*$", ErrorMessage = "El país debe ser US (Estados Unidos) o NI (Nicaragua).")]
    string Pais);

/// <summary>Cambia el nombre de una ubicación o de una ruta.</summary>
public sealed record RenameRequest(
    [Required(ErrorMessage = "El nombre es obligatorio.")]
    [MaxLength(100, ErrorMessage = "El nombre admite hasta 100 caracteres.")]
    string Nombre);

public sealed record LocationResponse(int Id, string Codigo, string Nombre, string Pais, bool Activo);

/// <summary>Ruta nueva: de una ubicación en EE. UU. a una en Nicaragua.</summary>
public sealed record CreateRouteRequest(
    [Range(1, int.MaxValue, ErrorMessage = "El origen es obligatorio.")]
    int OrigenId,
    [Range(1, int.MaxValue, ErrorMessage = "El destino es obligatorio.")]
    int DestinoId,
    [Required(ErrorMessage = "El nombre es obligatorio (por ejemplo: Miami → Managua).")]
    [MaxLength(100, ErrorMessage = "El nombre admite hasta 100 caracteres.")]
    string Nombre);

public sealed record RouteResponse(int Id, string Nombre, LocationResponse Origen, LocationResponse Destino, bool Activo);
