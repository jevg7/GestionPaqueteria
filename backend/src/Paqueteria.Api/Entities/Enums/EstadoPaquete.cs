namespace Paqueteria.Api.Entities;

/// <summary>
/// Estados del paquete. Los valores son los ids fijos de la tabla estados_paquete:
/// no renumerar. Para agregar un estado, usar un id nuevo.
/// </summary>
public enum EstadoPaquete : short
{
    Registrado = 1,
    RecibidoEnMiami = 2,
    PendienteDeEnvio = 3,
    EnTransito = 4,
    RecibidoEnNicaragua = 5,
    PendienteDePago = 6,
    Pagado = 7,
    ListoParaEntrega = 8,
    EnReparto = 9,
    Entregado = 10,
    Cancelado = 11,
}
