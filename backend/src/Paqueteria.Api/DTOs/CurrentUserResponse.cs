using Paqueteria.Api.Entities;

namespace Paqueteria.Api.DTOs;

/// <summary>
/// Quién inició sesión: un empleado de una agencia (Tipo AGENCIA, con su agencia y roles) o un dueño
/// de la plataforma (Tipo PLATAFORMA, rol PLATAFORMA, sin agencia).
/// </summary>
public sealed record CurrentUserResponse(
    string Tipo,
    long Id,
    string Nombres,
    string Apellidos,
    string Correo,
    IReadOnlyList<string> Roles,
    AgencyRef? Agencia);

public sealed record AgencyRef(long Id, string Nombre, EstadoAgencia Estado);
