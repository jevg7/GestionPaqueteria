using System.ComponentModel.DataAnnotations;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.DTOs;

/// <summary>
/// Tarifa nueva de un método de envío. Rige desde hoy (hora de Managua) o una fecha futura; la tarifa
/// anterior se cierra el día previo. Precio en USD por libra, con hasta 4 decimales.
/// </summary>
public sealed record CreateRateRequest(
    [Required(ErrorMessage = "El método de envío es obligatorio (AEREO o MARITIMO).")]
    [MaxLength(20, ErrorMessage = "El método de envío admite hasta 20 caracteres.")]
    string MetodoEnvio,
    [Range(typeof(decimal), "0.0001", "99999999.9999", ErrorMessage = "El precio debe ser mayor que cero.")]
    decimal PrecioPorUnidad,
    // Vacía = hoy.
    DateOnly? FechaInicio) : IValidatableObject
{
    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (decimal.Round(PrecioPorUnidad, 4) != PrecioPorUnidad)
        {
            yield return new ValidationResult("El precio admite hasta 4 decimales.", [nameof(PrecioPorUnidad)]);
        }
    }
}

/// <summary>Situación de una tarifa respecto de hoy (no se guarda: se calcula).</summary>
public enum EstadoTarifa
{
    /// <summary>Empieza después de hoy.</summary>
    Programada,
    Vigente,
    /// <summary>Terminó antes de hoy.</summary>
    Vencida,
    Anulada,
}

public sealed record RateResponse(
    int Id,
    ShippingMethodRef MetodoEnvio,
    decimal PrecioPorUnidad,
    UnidadTarifa Unidad,
    Moneda Moneda,
    DateOnly FechaInicio,
    DateOnly? FechaFin,
    EstadoTarifa Estado,
    long? CreadoPorUsuarioId,
    DateTimeOffset CreadoEn);

/// <summary>Tarifa que se aplica hoy a un método; null si no hay (no se pueden pesar paquetes de ese método).</summary>
public sealed record CurrentRateResponse(ShippingMethodRef MetodoEnvio, RateResponse? Tarifa);

/// <summary>Filtros de GET /api/rates.</summary>
public sealed class RateSearchQuery
{
    /// <summary>AEREO o MARITIMO; vacío = todos.</summary>
    [MaxLength(20, ErrorMessage = "El método de envío admite hasta 20 caracteres.")]
    public string? MetodoEnvio { get; init; }

    /// <summary>Incluir las anuladas (por defecto no).</summary>
    public bool IncluirAnuladas { get; init; }
}
