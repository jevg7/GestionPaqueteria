import { describe, expect, it, vi } from 'vitest'
import transicionesDelBackend from '../../../backend/src/Paqueteria.Api/Services/TransicionesPaquete.cs?raw'
import {
  cuerpoDelPaquete,
  datosDePaquete,
  esFinal,
  esquemaCancelacion,
  esquemaPaquete,
  esquemaPesaje,
  estadosDePaquete,
  montoEstimado,
  paqueteVacio,
  permiteCambiarClienteYMetodo,
  sePuedeCancelar,
  sePuedePesar,
  sePuedeRecibirEnMiami,
  textoDelCalculo,
  type Paquete,
} from './paquetes.ts'

// paquetes.ts usa el cliente de la API; estas pruebas solo miran las reglas, los esquemas y los textos.
vi.mock('../lib/env.ts', () => ({ env: { VITE_API_URL: 'https://api.test' } }))
vi.mock('../lib/supabase.ts', () => ({ supabase: { auth: { getSession: vi.fn() } } }))

const mensajes = (resultado: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  Object.fromEntries((resultado.error?.issues ?? []).map((issue) => [issue.path.join('.'), issue.message]))

const cliente = { id: 1, codigoCliente: 'CLI-000001', nombres: 'María José', apellidos: 'Pérez' }

const paquete = (cambios: Partial<Paquete> = {}): Paquete => ({
  id: 5,
  codigoPaquete: 'PKG-000005',
  cliente,
  trackingExterno: null,
  tienda: null,
  descripcion: 'Zapatos',
  metodoEnvio: { codigo: 'AEREO', nombre: 'Aéreo' },
  estado: { id: 1, codigo: 'REGISTRADO', nombre: 'Registrado' },
  codigoEmbarque: null,
  pesoLb: null,
  tarifaAplicada: null,
  montoCalculado: null,
  fechaRegistro: '2026-10-18T17:30:00Z',
  fechaRecepcionMiami: null,
  fechaRecepcionNicaragua: null,
  actualizadoEn: '2026-10-18T17:30:00Z',
  ...cambios,
})

describe('montoEstimado (los casos de CalculoMontoTests)', () => {
  it.each([
    [4.5, 3.5, 15.75],
    [2.25, 3.5, 7.88], // 7.875
    [1, 7.865, 7.87], // medio: hacia arriba, como round() de PostgreSQL; el redondeo bancario daría 7.86
    [0.01, 0.01, 0],
    [12.34, 1.75, 21.6], // 21.595
  ])('%s lb × %s USD = %s USD', (peso, tarifa, monto) => {
    expect(montoEstimado(peso, tarifa)).toBe(monto)
  })

  it('no arrastra los errores del punto flotante (0.29 × 100 = 28.999…)', () => {
    expect(montoEstimado(0.29, 1)).toBe(0.29)
    expect(montoEstimado(99999999.99, 1)).toBe(99999999.99)
  })
})

describe('esquemaPaquete (las reglas y mensajes de PackageRequest)', () => {
  it('pide cliente, método y descripción', () => {
    expect(mensajes(esquemaPaquete.safeParse(paqueteVacio(null)))).toEqual({
      cliente: 'El cliente es obligatorio.',
      metodoEnvio: 'El método de envío es obligatorio.',
      descripcion: 'La descripción es obligatoria.',
    })
  })

  it('tracking y tienda son opcionales, con hasta 100 caracteres', () => {
    const resultado = esquemaPaquete.safeParse({
      ...paqueteVacio(cliente),
      metodoEnvio: 'AEREO',
      trackingExterno: '1'.repeat(101),
      tienda: 'x'.repeat(101),
      descripcion: 'Zapatos',
    })
    expect(mensajes(resultado)).toEqual({
      trackingExterno: 'El tracking admite hasta 100 caracteres.',
      tienda: 'La tienda admite hasta 100 caracteres.',
    })
  })

  it('a la API va el id del cliente y los textos recortados', () => {
    const datos = esquemaPaquete.parse({
      cliente,
      metodoEnvio: 'MARITIMO',
      trackingExterno: ' 1Z999AA1 ',
      tienda: ' ',
      descripcion: ' Dos pares de zapatos\nTalla 40 ',
    })
    expect(cuerpoDelPaquete(datos)).toEqual({
      clienteId: 1,
      metodoEnvio: 'MARITIMO',
      trackingExterno: '1Z999AA1',
      tienda: '',
      descripcion: 'Dos pares de zapatos\nTalla 40',
    })
  })

  it('la edición precarga los datos; los vacíos (null) como texto vacío', () => {
    expect(datosDePaquete(paquete({ tienda: 'Amazon' }))).toEqual({
      cliente,
      metodoEnvio: 'AEREO',
      trackingExterno: '',
      tienda: 'Amazon',
      descripcion: 'Zapatos',
    })
  })
})

describe('pesaje y cancelación', () => {
  const peso = (valor: string) => esquemaPesaje.safeParse({ pesoLb: valor })

  it('el peso sale como número, con hasta 2 decimales y mayor que cero', () => {
    expect(esquemaPesaje.parse({ pesoLb: ' 4.5 ' })).toEqual({ pesoLb: 4.5 })
    expect(mensajes(peso(''))).toEqual({ pesoLb: 'Indique el peso en libras.' })
    expect(mensajes(peso('4.505'))).toEqual({ pesoLb: 'Escriba el peso con punto decimal y hasta 2 decimales (por ejemplo, 4.50).' })
    expect(mensajes(peso('4,5'))).toEqual({ pesoLb: 'Escriba el peso con punto decimal y hasta 2 decimales (por ejemplo, 4.50).' })
    expect(mensajes(peso('0.00'))).toEqual({ pesoLb: 'El peso debe ser mayor que cero.' })
    // El máximo de WeighPackageRequest: 99999999.99.
    expect(peso('99999999.99').success).toBe(true)
    expect(peso('100000000').success).toBe(false)
  })

  it('cancelar exige un motivo', () => {
    expect(mensajes(esquemaCancelacion.safeParse({ motivo: '  ' }))).toEqual({ motivo: 'El motivo de la cancelación es obligatorio.' })
  })

  it('el cálculo se muestra solo cuando el paquete ya se pesó', () => {
    expect(textoDelCalculo(paquete())).toBeNull()
    expect(textoDelCalculo(paquete({ pesoLb: 4.5, tarifaAplicada: 3.5, montoCalculado: 15.75 }))).toBe(
      '4.50 lb × 3.50 USD/lb = 15.75 USD',
    )
  })
})

describe('acciones por estado', () => {
  it('recibir en Miami solo un REGISTRADO; pesar al llegar a Nicaragua o para corregir', () => {
    expect(estadosDePaquete.filter(sePuedeRecibirEnMiami)).toEqual(['REGISTRADO'])
    expect(estadosDePaquete.filter(sePuedePesar)).toEqual(['RECIBIDO_EN_NICARAGUA', 'PENDIENTE_DE_PAGO'])
    expect(estadosDePaquete.filter(permiteCambiarClienteYMetodo)).toEqual(['REGISTRADO', 'RECIBIDO_EN_MIAMI'])
  })
})

// Si cambia la tabla del backend, estas pruebas avisan que hay que revisar qué acciones ofrece la interfaz.
describe('las reglas coinciden con Services/TransicionesPaquete.cs', () => {
  const codigo = (pascal: string) => pascal.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()
  const tabla = new Map(
    [...transicionesDelBackend.matchAll(/\[EstadoPaquete\.(\w+)\] = \[([^\]]*)\]/g)].map(([, desde, hacia]) => [
      codigo(desde),
      [...hacia.matchAll(/EstadoPaquete\.(\w+)/g)].map(([, estado]) => codigo(estado)),
    ]),
  )
  const cambiaClienteYMetodo = [
    ...(transicionesDelBackend.match(/PermiteCambiarClienteYMetodo\(EstadoPaquete estado\) =>\s*estado is ([^;]+);/)?.[1] ?? '').matchAll(
      /EstadoPaquete\.(\w+)/g,
    ),
  ].map(([, estado]) => codigo(estado))

  it('los mismos estados, en el mismo orden', () => {
    expect([...tabla.keys()]).toEqual([...estadosDePaquete])
  })

  it('finales: los que no pasan a ningún otro', () => {
    expect(estadosDePaquete.filter(esFinal)).toEqual(estadosDePaquete.filter((estado) => tabla.get(estado)?.length === 0))
  })

  it('cancelables: los que pueden pasar a CANCELADO', () => {
    expect(estadosDePaquete.filter(sePuedeCancelar)).toEqual(
      estadosDePaquete.filter((estado) => tabla.get(estado)?.includes('CANCELADO')),
    )
  })

  it('recibir en Miami y pesar son transiciones de la tabla', () => {
    expect(tabla.get('REGISTRADO')).toContain('RECIBIDO_EN_MIAMI')
    expect(tabla.get('RECIBIDO_EN_NICARAGUA')).toContain('PENDIENTE_DE_PAGO')
  })

  it('cliente y método cambian en los mismos estados que PermiteCambiarClienteYMetodo', () => {
    expect(estadosDePaquete.filter(permiteCambiarClienteYMetodo)).toEqual(cambiaClienteYMetodo)
  })
})
