namespace Paqueteria.Api.Entities;

/// <summary>Línea de factura. Inmutable: no se modifica ni se borra.</summary>
public class DetalleFactura
{
    public long Id { get; set; }

    /// <summary>Agencia dueña de la fila. La pone la BD (variable de sesión paqueteria.agencia_id); el código nunca la asigna.</summary>
    public long AgenciaId { get; private set; }
    public long FacturaId { get; set; }

    /// <summary>Vacío para cargos no ligados a un paquete (delivery, almacenaje).</summary>
    public long? PaqueteId { get; set; }

    /// <summary>Ej.: "Envío aéreo PKG-000001".</summary>
    public string Descripcion { get; set; } = null!;

    /// <summary>Libras facturadas, o 1 para cargos fijos.</summary>
    public decimal Cantidad { get; set; }

    public decimal PrecioUnitario { get; set; }

    /// <summary>Debe ser round(Cantidad × PrecioUnitario, 2), con MidpointRounding.AwayFromZero.</summary>
    public decimal Subtotal { get; set; }

    public Factura Factura { get; set; } = null!;
    public Paquete? Paquete { get; set; }
}
