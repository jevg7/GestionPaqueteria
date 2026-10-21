import { describe, expect, it, vi } from 'vitest'
import { esquemaNuevaTarifa, precioDeTarifa, sePuedeAnular, vigenciaDeTarifa, type Tarifa } from './tarifas.ts'

// tarifas.ts usa el cliente de la API; estas pruebas solo miran las reglas y los textos.
vi.mock('../lib/env.ts', () => ({ env: { VITE_API_URL: 'https://api.test' } }))
vi.mock('../lib/supabase.ts', () => ({ supabase: { auth: { getSession: vi.fn() } } }))

const tarifa = (cambios: Partial<Tarifa> = {}): Tarifa => ({
  id: 1,
  metodoEnvio: { codigo: 'AEREO', nombre: 'Aéreo' },
  precioPorUnidad: 3.5,
  unidad: 'LB',
  moneda: 'USD',
  fechaInicio: '2026-01-01',
  fechaFin: null,
  estado: 'VIGENTE',
  creadoPorUsuarioId: 7,
  creadoEn: '2026-01-01T12:00:00Z',
  ...cambios,
})

describe('esquemaNuevaTarifa (CreateRateRequest y TarifasService)', () => {
  const esquema = esquemaNuevaTarifa('2026-10-20')

  it('convierte el precio en número y acepta hoy o una fecha futura', () => {
    expect(esquema.parse({ metodoEnvio: 'MARITIMO', precioPorUnidad: '1.25', fechaInicio: '2026-10-20' })).toEqual({
      metodoEnvio: 'MARITIMO',
      precioPorUnidad: 1.25,
      fechaInicio: '2026-10-20',
    })
    expect(esquema.safeParse({ metodoEnvio: 'AEREO', precioPorUnidad: '3.7525', fechaInicio: '2026-11-01' }).success).toBe(true)
  })

  it('rechaza una fecha pasada, el precio mal escrito y el método vacío', () => {
    const resultado = esquema.safeParse({ metodoEnvio: '', precioPorUnidad: '3,50', fechaInicio: '2026-10-19' })
    const mensajes = Object.fromEntries((resultado.error?.issues ?? []).map((issue) => [issue.path.join('.'), issue.message]))

    expect(mensajes.metodoEnvio).toBe('El método de envío es obligatorio.')
    expect(mensajes.precioPorUnidad).toBe('Escriba el precio con punto decimal y hasta 4 decimales (por ejemplo, 3.50).')
    expect(mensajes.fechaInicio).toMatch(/^Una tarifa rige desde hoy en adelante: la fecha no puede ser anterior al .*2026\.$/)
  })
})

describe('textos de una tarifa', () => {
  it('precio y vigencia', () => {
    expect(precioDeTarifa(tarifa())).toBe('3.50 USD por libra')
    expect(vigenciaDeTarifa(tarifa())).toMatch(/^desde el .*2026$/)
    expect(vigenciaDeTarifa(tarifa({ fechaFin: '2026-03-31' }))).toMatch(/^del .*2026 al .*2026$/)
  })

  it('solo se ofrece anular las programadas y las vigentes', () => {
    expect([tarifa({ estado: 'PROGRAMADA' }), tarifa({ estado: 'VIGENTE' })].every(sePuedeAnular)).toBe(true)
    expect([tarifa({ estado: 'VENCIDA' }), tarifa({ estado: 'ANULADA' })].some(sePuedeAnular)).toBe(false)
  })
})
