using System.Collections.Frozen;
using Paqueteria.Api.Data;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.Services;

/// <summary>
/// Ciclo de vida del paquete (sección 6 de docs/modelo-datos.md). La BD garantiza que todo
/// cambio pase por el historial y que no se salga de un estado final; qué transición está
/// permitida lo decide esta tabla. Qué rol puede hacer cada una lo deciden los endpoints.
/// </summary>
public static class TransicionesPaquete
{
    private static readonly FrozenDictionary<EstadoPaquete, EstadoPaquete[]> Permitidas =
        new Dictionary<EstadoPaquete, EstadoPaquete[]>
        {
            [EstadoPaquete.Registrado] = [EstadoPaquete.RecibidoEnMiami, EstadoPaquete.Cancelado],
            [EstadoPaquete.RecibidoEnMiami] = [EstadoPaquete.PendienteDeEnvio, EstadoPaquete.Cancelado],
            // PENDIENTE_DE_ENVIO -> RECIBIDO_EN_MIAMI: se quita de un embarque ABIERTO (solo EmbarquesService).
            [EstadoPaquete.PendienteDeEnvio] = [EstadoPaquete.EnTransito, EstadoPaquete.Cancelado, EstadoPaquete.RecibidoEnMiami],
            [EstadoPaquete.EnTransito] = [EstadoPaquete.RecibidoEnNicaragua],
            [EstadoPaquete.RecibidoEnNicaragua] = [EstadoPaquete.PendienteDePago],
            // PENDIENTE_DE_PAGO -> LISTO_PARA_ENTREGA: pago contra entrega (exige factura emitida; ver PrepararEntregaAsync).
            [EstadoPaquete.PendienteDePago] = [EstadoPaquete.Pagado, EstadoPaquete.ListoParaEntrega],
            // PAGADO -> PENDIENTE_DE_PAGO: se anuló un pago de su factura (solo FacturacionService).
            [EstadoPaquete.Pagado] = [EstadoPaquete.ListoParaEntrega, EstadoPaquete.PendienteDePago],
            [EstadoPaquete.ListoParaEntrega] = [EstadoPaquete.Entregado, EstadoPaquete.EnReparto],
            // EN_REPARTO -> LISTO_PARA_ENTREGA es el delivery fallido.
            [EstadoPaquete.EnReparto] = [EstadoPaquete.Entregado, EstadoPaquete.ListoParaEntrega],
            [EstadoPaquete.Entregado] = [],
            [EstadoPaquete.Cancelado] = [],
        }.ToFrozenDictionary();

    public static bool EstaPermitida(EstadoPaquete desde, EstadoPaquete hacia) =>
        Permitidas.TryGetValue(desde, out var siguientes) && siguientes.Contains(hacia);

    public static IReadOnlyList<EstadoPaquete> Siguientes(EstadoPaquete desde) =>
        Permitidas.TryGetValue(desde, out var siguientes) ? siguientes : [];

    public static bool EsFinal(EstadoPaquete estado) => Siguientes(estado).Count == 0;

    /// <summary>Cliente y método solo cambian antes de asignar el paquete a un embarque.</summary>
    public static bool PermiteCambiarClienteYMetodo(EstadoPaquete estado) =>
        estado is EstadoPaquete.Registrado or EstadoPaquete.RecibidoEnMiami;

    /// <summary>Código del catálogo estados_paquete: RecibidoEnMiami -&gt; RECIBIDO_EN_MIAMI.</summary>
    public static string Codigo(EstadoPaquete estado) => UpperSnake.DesdePascalCase(estado.ToString());

    public static EstadoPaquete? DesdeCodigo(string codigo) =>
        Enum.GetValues<EstadoPaquete>().Cast<EstadoPaquete?>()
            .FirstOrDefault(e => Codigo(e!.Value).Equals(codigo.Trim(), StringComparison.OrdinalIgnoreCase));
}
