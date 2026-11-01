import { beforeEach, expect, it, vi } from 'vitest'
import type {
  AsientoContable,
  BalanceGeneral,
  BalanzaComprobacion,
  CuentaContable,
  EstadoResultados,
} from '../lib/contabilidad'
import type { Paginado } from '../types'

let demo: typeof import('./contabilidad').contabilidadDemo
beforeEach(async () => {
  vi.resetModules()
  demo = (await import('./contabilidad')).contabilidadDemo
})
function pedir<T>(path: string, method = 'GET', body?: unknown): T {
  return demo<T>(
    new URL(`http://localhost/api/accounting/${path}`),
    method,
    body,
  )
}
function plan() {
  const cuentas = pedir<CuentaContable[]>('accounts/initialize', 'POST')
  const id = (codigo: string) => cuentas.find((c) => c.codigo === codigo)!.id
  return {
    caja: id('1101'),
    capital: id('3101'),
    ingresos: id('4101'),
    alquiler: id('6101'),
  }
}
function asiento(
  fecha: string,
  debeId: number,
  haberId: number,
  monto: number,
) {
  return pedir<AsientoContable>('journal', 'POST', {
    fecha,
    concepto: 'Movimiento de prueba',
    referencia: null,
    partidas: [
      { cuentaId: debeId, debe: monto, haber: 0, detalle: null },
      { cuentaId: haberId, debe: 0, haber: monto, detalle: null },
    ],
  })
}

it('construye balance acumulado y resultados del período desde apertura, ingreso y gasto, sin saldos iniciales inventados', () => {
  const cuentas = plan()
  expect(pedir<Paginado<AsientoContable>>('journal').total).toBe(0)
  asiento('2026-09-01', cuentas.caja, cuentas.capital, 1000)
  asiento('2026-09-15', cuentas.caja, cuentas.ingresos, 200)
  asiento('2026-10-10', cuentas.caja, cuentas.ingresos, 500)
  pedir('expenses', 'POST', {
    fecha: '2026-10-20',
    concepto: 'Alquiler',
    referencia: 'REC-1',
    cuentaGastoId: cuentas.alquiler,
    contrapartidaId: cuentas.caja,
    monto: 100.75,
  })

  const balance = pedir<BalanceGeneral>('balance-sheet?asOf=2026-10-31')
  expect(balance).toMatchObject({
    moneda: 'NIO',
    totalActivos: 1599.25,
    totalPasivos: 0,
    capitalYReservas: 1000,
    resultadoAcumulado: 599.25,
    totalPatrimonio: 1599.25,
    diferencia: 0,
    cuadrado: true,
  })
  const resultados = pedir<EstadoResultados>(
    'income-statement?from=2026-10-01&to=2026-10-31',
  )
  expect(resultados).toMatchObject({
    ingresos: 500,
    costos: 0,
    gastos: 100.75,
    resultadoNeto: 399.25,
  })
  const balanza = pedir<BalanzaComprobacion>(
    'trial-balance?from=2026-10-01&to=2026-10-31',
  )
  expect(balanza).toMatchObject({
    totalDebe: 600.75,
    totalHaber: 600.75,
    cuadrado: true,
  })
  expect(
    balanza.cuentas.find((c) => c.cuentaId === cuentas.caja)?.saldoInicial,
  ).toBe(1200)
})

it('conserva el corte histórico al revertir el gasto en una fecha posterior', () => {
  const cuentas = plan()
  asiento('2026-09-01', cuentas.caja, cuentas.capital, 1000)
  const gasto = pedir<AsientoContable>('expenses', 'POST', {
    fecha: '2026-10-20',
    concepto: 'Gasto por corregir',
    referencia: null,
    cuentaGastoId: cuentas.alquiler,
    contrapartidaId: cuentas.caja,
    monto: 75.25,
  })
  const reversa = pedir<AsientoContable>(
    `journal/${gasto.id}/reverse`,
    'POST',
    { fecha: '2026-11-01', motivo: 'Se registró dos veces' },
  )
  expect(reversa.reversionDeId).toBe(gasto.id)
  expect(pedir<AsientoContable>(`journal/${gasto.id}`).revertidoPorId).toBe(
    reversa.id,
  )
  expect(pedir<BalanceGeneral>('balance-sheet?asOf=2026-10-31')).toMatchObject({
    totalActivos: 924.75,
    resultadoAcumulado: -75.25,
    cuadrado: true,
  })
  expect(pedir<BalanceGeneral>('balance-sheet?asOf=2026-11-01')).toMatchObject({
    totalActivos: 1000,
    resultadoAcumulado: 0,
    cuadrado: true,
  })
  expect(
    pedir<EstadoResultados>('income-statement?from=2026-10-01&to=2026-10-31')
      .resultadoNeto,
  ).toBe(-75.25)
  expect(
    pedir<EstadoResultados>('income-statement?from=2026-11-01&to=2026-11-01')
      .resultadoNeto,
  ).toBe(75.25)
  expect(() =>
    pedir(`journal/${gasto.id}/reverse`, 'POST', {
      fecha: '2026-11-01',
      motivo: 'Otra vez',
    }),
  ).toThrow('ya fue revertido')
})

it('rechaza asientos descuadrados y montos que requieren redondeo sin modificar el libro', () => {
  const cuentas = plan()
  const crear = (debe: number, haber: number) =>
    pedir('journal', 'POST', {
      fecha: '2026-10-01',
      concepto: 'Inválido',
      referencia: null,
      partidas: [
        { cuentaId: cuentas.caja, debe, haber: 0, detalle: null },
        { cuentaId: cuentas.capital, debe: 0, haber, detalle: null },
      ],
    })
  expect(() => crear(10, 9.99)).toThrow('debe cuadrar')
  expect(() => crear(1.005, 1.01)).toThrow('dos decimales')
  expect(pedir<Paginado<AsientoContable>>('journal').total).toBe(0)
})
