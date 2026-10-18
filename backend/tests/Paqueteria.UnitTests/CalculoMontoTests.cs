using Paqueteria.Api.Data;
using Paqueteria.Api.Entities;
using Paqueteria.Api.Services;

namespace Paqueteria.UnitTests;

public class CalculoMontoTests
{
    [Theory]
    [InlineData("4.5", "3.50", "15.75")]    // ejemplo del documento de instrucciones
    [InlineData("2.25", "3.50", "7.88")]    // 7.875
    [InlineData("1.00", "7.8650", "7.87")]  // medio: PostgreSQL y AwayFromZero dan 7.87; el redondeo bancario daría 7.86
    [InlineData("0.01", "0.0100", "0.00")]
    [InlineData("12.34", "1.7500", "21.60")] // 21.595
    public void RedondeaA2DecimalesComoPostgreSQL(string peso, string tarifa, string esperado)
    {
        Assert.Equal(decimal.Parse(esperado), CalculoMonto.Calcular(decimal.Parse(peso), decimal.Parse(tarifa)));
    }

    [Theory]
    [InlineData("2026-09-30T17:59:00Z", "2026-09-30")] // 11:59 en Managua
    [InlineData("2026-10-01T05:59:00Z", "2026-09-30")] // 23:59 en Managua: en UTC ya es 1 de octubre
    [InlineData("2026-10-01T06:00:00Z", "2026-10-01")] // medianoche en Managua (UTC-6, sin horario de verano)
    public void LaFechaDelNegocioEsLaDeManagua(string instanteUtc, string fecha)
    {
        Assert.Equal(DateOnly.Parse(fecha), CalculoMonto.FechaEnManagua(DateTimeOffset.Parse(instanteUtc)));
    }

    [Theory]
    [InlineData("576.83", "36.6243", "15.75")]
    [InlineData("300.00", "36.6243", "8.19")]  // pago parcial: 8.1913…
    [InlineData("0.01", "2.0000", "0.01")]     // medio exacto (0.005): hacia arriba, como PostgreSQL
    public void CordobasADolares(string cordobas, string tipoCambio, string dolares)
    {
        Assert.Equal(decimal.Parse(dolares), CalculoMonto.ADolares(decimal.Parse(cordobas), decimal.Parse(tipoCambio)));
    }

    /// <summary>
    /// Pagar en córdobas el saldo convertido abona exactamente el saldo, para cualquier saldo y tipo
    /// de cambio realista: así un cliente puede saldar en córdobas sin quedar debiendo un centavo ni
    /// exceder el saldo (el trigger lo rechazaría).
    /// </summary>
    [Fact]
    public void PagarElSaldoConvertidoACordobasLoSaldaExacto()
    {
        var azar = new Random(20260929);
        for (var i = 0; i < 100_000; i++)
        {
            var saldo = azar.Next(1, 1_000_000) / 100m;         // 0.01 a 9 999.99 USD
            var tipoCambio = azar.Next(300_000, 400_000) / 10_000m; // 30.0000 a 39.9999 NIO/USD

            Assert.Equal(saldo, CalculoMonto.ADolares(CalculoMonto.ACordobas(saldo, tipoCambio), tipoCambio));
        }
    }
}

public class UpperSnakeTests
{
    [Theory]
    [InlineData("EnTransito", "EN_TRANSITO")]
    [InlineData("RetiroEnAgencia", "RETIRO_EN_AGENCIA")]
    [InlineData("Usd", "USD")]
    [InlineData("Pie3", "PIE3")]
    public void PascalCaseAUpperSnake(string nombre, string esperado)
    {
        Assert.Equal(esperado, UpperSnake.DesdePascalCase(nombre));
    }

    /// <summary>
    /// La API serializa los enums con JsonNamingPolicy.SnakeCaseUpper y EF los guarda con UpperSnake:
    /// ambos deben producir el mismo código para que el JSON coincida con la BD.
    /// </summary>
    [Fact]
    public void ElCodigoJsonDeCadaEnumEsElDeLaBd()
    {
        var enums = typeof(EstadoPaquete).Assembly.GetTypes()
            .Where(t => t.IsEnum && t.Namespace == typeof(EstadoPaquete).Namespace)
            .ToList();
        Assert.Contains(typeof(EstadoEmbarque), enums);

        foreach (var nombre in enums.SelectMany(Enum.GetNames))
        {
            Assert.Equal(UpperSnake.DesdePascalCase(nombre), System.Text.Json.JsonNamingPolicy.SnakeCaseUpper.ConvertName(nombre));
        }
    }

    [Fact]
    public void ConvierteEnAmbosSentidosYRechazaValoresDesconocidos()
    {
        Assert.Equal("EN_RUTA", UpperSnakeEnum<EstadoEntrega>.ATexto(EstadoEntrega.EnRuta));
        Assert.Equal(EstadoEntrega.EnRuta, UpperSnakeEnum<EstadoEntrega>.DesdeTexto("EN_RUTA"));
        Assert.Throws<InvalidOperationException>(() => UpperSnakeEnum<EstadoEntrega>.DesdeTexto("en_ruta"));
        Assert.Throws<InvalidOperationException>(() => UpperSnakeEnum<EstadoEntrega>.ATexto(default));
    }
}
