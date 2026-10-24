import { describe, expect, it, vi } from 'vitest'
import enumeracionesDelBackend from '../../../backend/src/Paqueteria.Api/Entities/Enums/EnumeracionesDominio.cs?raw'
import {
  esquemaAnulacion,
  esquemaPago,
  estadosDePago,
  facturadosEn,
  metodosDePago,
  monedas,
  saldoEnMoneda,
  sePuedeAnular,
  sePuedeAnularElPago,
  sePuedePagar,
  textoDelPago,
  type Factura,
  type Pago,
} from './facturas.ts'

// facturas.ts usa el cliente de la API; estas pruebas solo miran las reglas, los esquemas y los textos.
vi.mock('../lib/env.ts', () => ({ env: { VITE_API_URL: 'https://api.test' } }))
vi.mock('../lib/supabase.ts', () => ({ supabase: { auth: { getSession: vi.fn() } } }))

const mensajes = (resultado: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  Object.fromEntries((resultado.error?.issues ?? []).map((issue) => [issue.path.join('.'), issue.message]))

const pago = (cambios: Partial<Pago> = {}): Pago => ({
  id: 1,
  facturaId: 3,
  numeroFactura: 'FAC-000003',
  monto: 15.75,
  moneda: 'USD',
  montoMoneda: null,
  tipoCambioAplicado: null,
  metodoPago: 'EFECTIVO',
  referencia: null,
  fecha: '2026-10-20T15:00:00Z',
  estado: 'APLICADO',
  motivoAnulacion: null,
  anuladoEn: null,
  usuarioId: 8,
  ...cambios,
})

describe('esquemaPago (CreatePaymentRequest y FacturacionService)', () => {
  const datos = (cambios: Record<string, string>) => ({ moneda: 'USD', monto: '15.75', metodoPago: 'EFECTIVO', referencia: '', ...cambios })

  it('en dólares: hasta el saldo, con hasta 2 decimales', () => {
    const esquema = esquemaPago(15.75, null)
    expect(esquema.parse(datos({ referencia: ' Caja 1 ' }))).toEqual({ moneda: 'USD', monto: 15.75, metodoPago: 'EFECTIVO', referencia: 'Caja 1' })
    expect(mensajes(esquema.safeParse(datos({ monto: '15.76' })))).toEqual({ monto: 'El pago excede el saldo de la factura (15.75 USD).' })
    expect(mensajes(esquema.safeParse(datos({ monto: '1.555' })))).toEqual({
      monto: 'Escriba el monto con punto decimal y hasta 2 decimales (por ejemplo, 15.75).',
    })
  })

  it('pide el método de pago, y sin él también revisa el saldo (los dos errores a la vez)', () => {
    expect(mensajes(esquemaPago(15.75, null).safeParse(datos({ metodoPago: '' })))).toEqual({ metodoPago: 'Elija el método de pago.' })
    expect(mensajes(esquemaPago(15.75, null).safeParse(datos({ metodoPago: '', monto: '20' })))).toEqual({
      metodoPago: 'Elija el método de pago.',
      monto: 'El pago excede el saldo de la factura (15.75 USD).',
    })
  })

  it('en córdobas: se compara lo que abona en dólares (córdobas ÷ tipo de cambio) con el saldo', () => {
    const esquema = esquemaPago(15.75, 36.6243)
    expect(esquema.safeParse(datos({ moneda: 'NIO', monto: '576.83' })).success).toBe(true) // = 15.75 USD
    // 577.00 ÷ 36.6243 = 15.7546… → 15.75 USD: no excede (el backend lo acepta igual).
    expect(esquema.safeParse(datos({ moneda: 'NIO', monto: '577.00' })).success).toBe(true)
    expect(mensajes(esquema.safeParse(datos({ moneda: 'NIO', monto: '580' })))).toEqual({
      monto: 'El pago (15.84 USD) excede el saldo de la factura (15.75 USD = C$ 576.83).',
    })
  })

  it('en córdobas sin tipo de cambio vigente no se puede pagar; tampoco menos de 0.01 USD', () => {
    expect(mensajes(esquemaPago(15.75, null).safeParse(datos({ moneda: 'NIO', monto: '100' })))).toEqual({
      moneda: 'No hay un tipo de cambio vigente: no se pueden recibir córdobas.',
    })
    expect(mensajes(esquemaPago(15.75, 36.6243).safeParse(datos({ moneda: 'NIO', monto: '0.10' })))).toEqual({
      monto: 'El monto en córdobas equivale a menos de 0.01 USD.',
    })
  })

  it('el saldo completo en córdobas es su equivalente exacto', () => {
    expect(saldoEnMoneda(15.75, 'NIO', 36.6243)).toBe(576.83)
    expect(saldoEnMoneda(15.75, 'USD', 36.6243)).toBe(15.75)
  })

  it('anular exige el motivo', () => {
    expect(mensajes(esquemaAnulacion.safeParse({ motivo: ' ' }))).toEqual({ motivo: 'El motivo de la anulación es obligatorio.' })
  })
})

describe('reglas y textos', () => {
  it('se cobra con saldo; se anula sin pagos; un pago anulado no se vuelve a anular', () => {
    expect(sePuedePagar({ estado: 'EMITIDA', saldo: 0.01 })).toBe(true)
    expect(sePuedePagar({ estado: 'EMITIDA', saldo: 0 })).toBe(false)
    expect(sePuedePagar({ estado: 'ANULADA', saldo: 15.75 })).toBe(false)
    expect(sePuedeAnular({ estado: 'EMITIDA', pagado: 0 })).toBe(true)
    expect(sePuedeAnular({ estado: 'EMITIDA', pagado: 5 })).toBe(false)
    expect(sePuedeAnular({ estado: 'ANULADA', pagado: 0 })).toBe(false)
    expect(sePuedeAnularElPago(pago())).toBe(true)
    expect(sePuedeAnularElPago(pago({ estado: 'ANULADO' }))).toBe(false)
  })

  it('un pago en córdobas muestra lo recibido y lo abonado', () => {
    expect(textoDelPago(pago())).toBe('15.75 USD')
    expect(textoDelPago(pago({ moneda: 'NIO', montoMoneda: 576.83, tipoCambioAplicado: 36.6243 }))).toBe(
      'C$ 576.83 (15.75 USD al tipo de cambio 36.6243)',
    )
  })

  it('qué paquetes ya están en una factura con saldo', () => {
    const factura = { id: 3, numeroFactura: 'FAC-000003', lineas: [{ paqueteId: 5 }, { paqueteId: null }, { paqueteId: 7 }] } as unknown as Factura
    expect([...facturadosEn([factura]).entries()].map(([id, f]) => [id, f.numeroFactura])).toEqual([
      [5, 'FAC-000003'],
      [7, 'FAC-000003'],
    ])
  })
})

// Si el backend agrega un estado, un método o una moneda, la interfaz debe saber mostrarlos.
describe('los valores coinciden con los enums del backend', () => {
  const miembros = (nombre: string) => {
    const cuerpo = enumeracionesDelBackend.match(new RegExp(`public enum ${nombre}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
    return [...cuerpo.matchAll(/\b([A-Z]\w*)/g)].map(([, miembro]) => miembro.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase())
  }

  it('EstadoPagoFactura, MetodoPago y Moneda', () => {
    expect(miembros('EstadoPagoFactura')).toEqual([...estadosDePago])
    expect(miembros('MetodoPago')).toEqual([...metodosDePago])
    expect(miembros('Moneda')).toEqual([...monedas])
  })
})
