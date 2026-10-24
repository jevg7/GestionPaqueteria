import { describe, expect, it } from 'vitest'
import { aCentavos, cocienteRedondeado, productoRedondeado, restaDeMontos, sumaDeMontos } from './dinero.ts'

// Los mismos casos que CalculoMontoTests del backend.
describe('productoRedondeado (CalculoMonto.Calcular y ACordobas)', () => {
  it.each([
    [4.5, 3.5, 15.75],
    [2.25, 3.5, 7.88], // 7.875
    [1, 7.865, 7.87], // medio: PostgreSQL y AwayFromZero dan 7.87; el redondeo bancario daría 7.86
    [0.01, 0.01, 0],
    [12.34, 1.75, 21.6], // 21.595
    [15.75, 36.6243, 576.83], // un saldo en córdobas
  ])('%s × %s = %s', (a, b, esperado) => {
    expect(productoRedondeado(a, b)).toBe(esperado)
  })
})

describe('cocienteRedondeado (CalculoMonto.ADolares)', () => {
  it.each([
    [576.83, 36.6243, 15.75],
    [300, 36.6243, 8.19], // pago parcial: 8.1913…
    [0.01, 2, 0.01], // medio exacto (0.005): hacia arriba, como PostgreSQL
  ])('%s ÷ %s = %s', (a, b, esperado) => {
    expect(cocienteRedondeado(a, b)).toBe(esperado)
  })

  // PagarElSaldoConvertidoACordobasLoSaldaExacto: pagar en córdobas el saldo convertido abona exactamente el saldo.
  it('el saldo convertido a córdobas vuelve a ser exactamente el saldo (100 000 casos)', () => {
    // mulberry32 con semilla fija: los mismos casos en cada corrida.
    let estado = 20260929
    const azar = () => {
      estado = (estado + 0x6d2b79f5) | 0
      let t = Math.imul(estado ^ (estado >>> 15), 1 | estado)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
    }
    for (let i = 0; i < 100_000; i++) {
      const saldo = (1 + Math.floor(azar() * 999_999)) / 100 // 0.01 a 9 999.99 USD
      const tipoDeCambio = (300_000 + Math.floor(azar() * 100_000)) / 10_000 // 30.0000 a 39.9999 NIO/USD
      const pagado = cocienteRedondeado(productoRedondeado(saldo, tipoDeCambio), tipoDeCambio)
      if (pagado !== saldo) expect({ saldo, tipoDeCambio, pagado }).toEqual({ saldo, tipoDeCambio, pagado: saldo })
    }
  })
})

describe('sumas y restas exactas', () => {
  it('sin los errores del punto flotante (0.1 + 0.2)', () => {
    expect(sumaDeMontos([0.1, 0.2])).toBe(0.3)
    expect(sumaDeMontos([15.75, 7.88, 3.5])).toBe(27.13)
    expect(sumaDeMontos([])).toBe(0)
    expect(restaDeMontos(15.75, 5.5)).toBe(10.25)
    expect(restaDeMontos(0.3, 0.1)).toBe(0.2)
    expect(aCentavos(0.29)).toBe(29) // 0.29 × 100 = 28.999…
  })
})
