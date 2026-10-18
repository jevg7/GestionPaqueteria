namespace Paqueteria.Api.Entities;

/// <summary>
/// Fila de la vista v_facturas_saldo: pagado, saldo y estado de pago de cada factura,
/// calculados desde los pagos aplicados. Solo lectura; estos valores no se guardan.
/// </summary>
public class FacturaSaldo
{
    public long FacturaId { get; private set; }
    public long AgenciaId { get; private set; }
    public string NumeroFactura { get; private set; } = null!;
    public long ClienteId { get; private set; }
    public DateTimeOffset Fecha { get; private set; }
    public decimal Total { get; private set; }
    public EstadoFactura Estado { get; private set; }
    public decimal Pagado { get; private set; }
    public decimal Saldo { get; private set; }
    public EstadoPagoFactura EstadoPago { get; private set; }
}
