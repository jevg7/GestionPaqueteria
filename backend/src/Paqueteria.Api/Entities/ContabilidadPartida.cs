namespace Paqueteria.Api.Entities;

/// <summary>Movimiento inmutable de una sola cuenta; exactamente un lado es mayor que cero.</summary>
public class ContabilidadPartida
{
    public long Id { get; set; }
    public long AgenciaId { get; private set; }
    public long AsientoId { get; set; }
    public long CuentaId { get; set; }
    public decimal Debe { get; set; }
    public decimal Haber { get; set; }
    public string? Detalle { get; set; }
    public ContabilidadAsiento Asiento { get; set; } = null!;
    public ContabilidadCuenta Cuenta { get; set; } = null!;
}
