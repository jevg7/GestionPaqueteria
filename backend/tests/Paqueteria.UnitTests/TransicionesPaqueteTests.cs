using Paqueteria.Api.Entities;
using Paqueteria.Api.Services;
using static Paqueteria.Api.Entities.EstadoPaquete;

namespace Paqueteria.UnitTests;

public class TransicionesPaqueteTests
{
    /// <summary>La tabla de la sección 6 de docs/modelo-datos.md, escrita a mano para compararla.</summary>
    private static readonly (EstadoPaquete Desde, EstadoPaquete Hacia)[] Seccion6 =
    [
        (Registrado, RecibidoEnMiami),
        (RecibidoEnMiami, PendienteDeEnvio),
        (PendienteDeEnvio, EnTransito),
        (PendienteDeEnvio, RecibidoEnMiami), // quitar de un embarque abierto (agregada con el módulo de embarques)
        (EnTransito, RecibidoEnNicaragua),
        (RecibidoEnNicaragua, PendienteDePago),
        (PendienteDePago, Pagado),
        (PendienteDePago, ListoParaEntrega), // pago contra entrega (agregada con el módulo de entregas)
        (Pagado, ListoParaEntrega),
        (Pagado, PendienteDePago), // se anuló un pago de su factura (agregada con facturación y pagos)
        (ListoParaEntrega, Entregado),
        (ListoParaEntrega, EnReparto),
        (EnReparto, Entregado),
        (EnReparto, ListoParaEntrega),
        (Registrado, Cancelado),
        (RecibidoEnMiami, Cancelado),
        (PendienteDeEnvio, Cancelado),
    ];

    public static TheoryData<EstadoPaquete, EstadoPaquete> TodosLosPares()
    {
        var datos = new TheoryData<EstadoPaquete, EstadoPaquete>();
        foreach (var desde in Enum.GetValues<EstadoPaquete>())
        {
            foreach (var hacia in Enum.GetValues<EstadoPaquete>())
            {
                datos.Add(desde, hacia);
            }
        }
        return datos;
    }

    [Theory]
    [MemberData(nameof(TodosLosPares))]
    public void SoloSePermitenLasTransicionesDeLaSeccion6(EstadoPaquete desde, EstadoPaquete hacia)
    {
        Assert.Equal(Seccion6.Contains((desde, hacia)), TransicionesPaquete.EstaPermitida(desde, hacia));
    }

    [Fact]
    public void SoloEntregadoYCanceladoSonFinales()
    {
        var finales = Enum.GetValues<EstadoPaquete>().Where(TransicionesPaquete.EsFinal);

        Assert.Equal([Entregado, Cancelado], finales);
    }

    [Fact]
    public void ClienteYMetodoSoloCambianAntesDeAsignarseAUnEmbarque()
    {
        var permitidos = Enum.GetValues<EstadoPaquete>().Where(TransicionesPaquete.PermiteCambiarClienteYMetodo);

        Assert.Equal([Registrado, RecibidoEnMiami], permitidos);
    }

    [Theory]
    [InlineData(RecibidoEnMiami, "RECIBIDO_EN_MIAMI")]
    [InlineData(PendienteDePago, "PENDIENTE_DE_PAGO")]
    [InlineData(EnReparto, "EN_REPARTO")]
    public void CodigoEsElDelCatalogo(EstadoPaquete estado, string codigo)
    {
        Assert.Equal(codigo, TransicionesPaquete.Codigo(estado));
        Assert.Equal(estado, TransicionesPaquete.DesdeCodigo(codigo));
        Assert.Equal(estado, TransicionesPaquete.DesdeCodigo($" {codigo.ToLowerInvariant()} "));
    }

    [Fact]
    public void CodigoDesconocidoNoEsUnEstado()
    {
        Assert.Null(TransicionesPaquete.DesdeCodigo("EXTRAVIADO"));
    }
}
