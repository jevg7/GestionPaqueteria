import { describe, expect, it, vi } from 'vitest'
import { esquemaNombre, esquemaNuevaRuta, esquemaNuevaUbicacion } from './ubicaciones.ts'

// ubicaciones.ts usa el cliente de la API; estas pruebas solo miran los esquemas.
vi.mock('../lib/env.ts', () => ({ env: { VITE_API_URL: 'https://api.test' } }))
vi.mock('../lib/supabase.ts', () => ({ supabase: { auth: { getSession: vi.fn() } } }))

const mensajes = (resultado: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  Object.fromEntries((resultado.error?.issues ?? []).map((issue) => [issue.path.join('.'), issue.message]))

describe('esquemaNuevaUbicacion (CreateLocationRequest)', () => {
  it('el código queda en mayúsculas y sin espacios alrededor', () => {
    expect(esquemaNuevaUbicacion.parse({ codigo: ' fll ', nombre: ' Bodega Fort Lauderdale ', pais: 'US' })).toEqual({
      codigo: 'FLL',
      nombre: 'Bodega Fort Lauderdale',
      pais: 'US',
    })
  })

  it.each(['M', 'MIAMI12345X', 'MI A', 'MIA-1'])('rechaza el código "%s"', (codigo) => {
    expect(mensajes(esquemaNuevaUbicacion.safeParse({ codigo, nombre: 'X', pais: 'US' })).codigo).toBe(
      'El código tiene de 2 a 10 letras o dígitos, sin espacios.',
    )
  })

  it('pide el país (US o NI) y el nombre', () => {
    expect(mensajes(esquemaNuevaUbicacion.safeParse({ codigo: 'LEO', nombre: '', pais: '' }))).toEqual({
      nombre: 'El nombre es obligatorio.',
      pais: 'El país es obligatorio: US (Estados Unidos) o NI (Nicaragua).',
    })
  })
})

describe('esquemaNuevaRuta (CreateRouteRequest) y esquemaNombre (RenameRequest)', () => {
  it('los ids de las listas desplegables pasan a número', () => {
    expect(esquemaNuevaRuta.parse({ origenId: '1', destinoId: '2', nombre: 'Miami → Managua' })).toEqual({
      origenId: 1,
      destinoId: 2,
      nombre: 'Miami → Managua',
    })
  })

  it('pide origen, destino y nombre', () => {
    expect(mensajes(esquemaNuevaRuta.safeParse({ origenId: '', destinoId: '', nombre: ' ' }))).toEqual({
      origenId: 'El origen es obligatorio.',
      destinoId: 'El destino es obligatorio.',
      nombre: 'El nombre es obligatorio (por ejemplo: Miami → Managua).',
    })
  })

  it('renombrar pide un nombre de hasta 100 caracteres', () => {
    expect(mensajes(esquemaNombre.safeParse({ nombre: 'x'.repeat(101) })).nombre).toBe('El nombre admite hasta 100 caracteres.')
  })
})
