namespace Paqueteria.Api.Entities;

// Enumeraciones VARCHAR + CHECK del esquema. En la BD se guardan en UPPER_SNAKE
// (EnTransito <-> EN_TRANSITO) con UpperSnakeEnumConverter; el valor numérico no se
// guarda. Empiezan en 1 para que un valor sin asignar (0) falle al guardar en lugar
// de convertirse en silencio en el primer miembro.

/// <summary>embarques.estado</summary>
public enum EstadoEmbarque
{
    Abierto = 1,
    Cerrado,
    EnTransito,
    Recibido,
    Cancelado,
}

/// <summary>facturas.estado: ciclo de vida del documento, no su estado de pago.</summary>
public enum EstadoFactura
{
    Emitida = 1,
    Anulada,
}

/// <summary>v_facturas_saldo.estado_pago: derivado de los pagos aplicados.</summary>
public enum EstadoPagoFactura
{
    Pendiente = 1,
    Parcial,
    Pagada,
    Anulada,
}

/// <summary>pagos.estado</summary>
public enum EstadoPago
{
    Aplicado = 1,
    Anulado,
}

/// <summary>pagos.metodo_pago</summary>
public enum MetodoPago
{
    Efectivo = 1,
    Transferencia,
    Tarjeta,
    Otro,
}

/// <summary>entregas.tipo_entrega</summary>
public enum TipoEntrega
{
    RetiroEnAgencia = 1,
    Delivery,
}

/// <summary>entregas.estado</summary>
public enum EstadoEntrega
{
    Pendiente = 1,
    EnRuta,
    Entregada,
    Fallida,
    Cancelada,
}

/// <summary>tarifas_envio.unidad. En v1 solo LB (ver pregunta abierta sobre pie³).</summary>
public enum UnidadTarifa
{
    Lb = 1,
}

/// <summary>agencias.estado</summary>
public enum EstadoAgencia
{
    Activa = 1,
    Suspendida,
}

/// <summary>audit_logs.accion</summary>
public enum AccionAuditoria
{
    Insert = 1,
    Update,
    Delete,
}

/// <summary>
/// Monedas. Tarifas y facturas están en USD (su CHECK solo admite USD); los pagos se reciben en USD
/// o en córdobas (NIO), que se convierten a USD con el tipo de cambio del día.
/// </summary>
public enum Moneda
{
    Usd = 1,
    Nio,
}
