using System.ComponentModel.DataAnnotations;

namespace Paqueteria.Api.DTOs;

/// <summary>
/// Datos de un paquete, iguales para registrar (POST) y reemplazar (PUT). Estado, peso, tarifa y
/// monto no se reciben aquí: los produce el flujo (recepción, pesaje).
/// </summary>
public sealed record PackageRequest(
    [Range(1, long.MaxValue, ErrorMessage = "El cliente es obligatorio.")]
    long ClienteId,
    [Required(ErrorMessage = "El método de envío es obligatorio (AEREO o MARITIMO).")]
    [MaxLength(20, ErrorMessage = "El método de envío admite hasta 20 caracteres.")]
    string MetodoEnvio,
    [MaxLength(100, ErrorMessage = "El tracking admite hasta 100 caracteres.")]
    string? TrackingExterno,
    [MaxLength(100, ErrorMessage = "La tienda admite hasta 100 caracteres.")]
    string? Tienda,
    [Required(ErrorMessage = "La descripción es obligatoria.")]
    string Descripcion);

public sealed record ReceivePackageRequest(string? Observacion);

public sealed record WeighPackageRequest(
    [Range(typeof(decimal), "0.01", "99999999.99", ErrorMessage = "El peso debe estar entre 0.01 y 99999999.99 libras.")]
    decimal PesoLb) : IValidatableObject
{
    // peso_lb es NUMERIC(10,2): con más decimales la BD redondearía el peso pero no el monto.
    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (PesoLb != Math.Round(PesoLb, 2))
        {
            yield return new ValidationResult("El peso admite hasta 2 decimales.", [nameof(PesoLb)]);
        }
    }
}

public sealed record CancelPackageRequest(
    [Required(ErrorMessage = "El motivo de la cancelación es obligatorio.")]
    string Motivo);

public sealed record PackageClientRef(long Id, string CodigoCliente, string Nombres, string Apellidos);

public sealed record ShippingMethodRef(string Codigo, string Nombre);

public sealed record PackageStateRef(short Id, string Codigo, string Nombre);

public sealed record PackageResponse(
    long Id,
    string CodigoPaquete,
    PackageClientRef Cliente,
    string? TrackingExterno,
    string? Tienda,
    string Descripcion,
    ShippingMethodRef MetodoEnvio,
    PackageStateRef Estado,
    string? CodigoEmbarque,
    decimal? PesoLb,
    decimal? TarifaAplicada,
    decimal? MontoCalculado,
    DateTimeOffset FechaRegistro,
    DateTimeOffset? FechaRecepcionMiami,
    DateTimeOffset? FechaRecepcionNicaragua,
    DateTimeOffset ActualizadoEn);

public sealed record PackageHistoryEntry(
    long Id,
    DateTimeOffset Fecha,
    PackageStateRef Estado,
    long UsuarioId,
    string Usuario,
    string? Observacion);

/// <summary>Filtros de GET /api/packages.</summary>
public sealed class PackageSearchQuery
{
    /// <summary>Busca en código del paquete, tracking y descripción.</summary>
    [MaxLength(100, ErrorMessage = "La búsqueda admite hasta 100 caracteres.")]
    public string? Search { get; init; }

    /// <summary>Código del estado: REGISTRADO, RECIBIDO_EN_MIAMI…</summary>
    public string? Estado { get; init; }

    public long? ClienteId { get; init; }

    /// <summary>AEREO o MARITIMO.</summary>
    public string? MetodoEnvio { get; init; }

    [Range(1, int.MaxValue, ErrorMessage = "page empieza en 1.")]
    public int Page { get; init; } = 1;

    [Range(1, 100, ErrorMessage = "pageSize debe estar entre 1 y 100.")]
    public int PageSize { get; init; } = 20;
}
