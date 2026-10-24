import { describe, expect, it, vi } from 'vitest'
import esquemaDeLaBd from '../../../database/schema.sql?raw'
import enumeracionesDelBackend from '../../../backend/src/Paqueteria.Api/Entities/Enums/EnumeracionesDominio.cs?raw'
import { accionesDeAuditoria, camposDelRegistro, finDelDia, inicioDelDia, tablasAuditadas, textoDelValor } from './auditoria.ts'

// auditoria.ts usa el cliente de la API; estas pruebas solo miran las reglas y los textos.
vi.mock('../lib/env.ts', () => ({ env: { VITE_API_URL: 'https://api.test' } }))
vi.mock('../lib/supabase.ts', () => ({ supabase: { auth: { getSession: vi.fn() } } }))

describe('los cambios de un registro', () => {
  it('en un cambio: antes y después de lo que cambió', () => {
    expect(camposDelRegistro({ valoresAnteriores: { estado: 'APLICADO' }, valoresNuevos: { estado: 'ANULADO', motivo_anulacion: 'Rechazada' } })).toEqual([
      { campo: 'estado', antes: 'APLICADO', despues: 'ANULADO' },
      { campo: 'motivo_anulacion', antes: undefined, despues: 'Rechazada' },
    ])
  })

  it('en un alta solo hay valores nuevos; en un borrado, anteriores', () => {
    expect(camposDelRegistro({ valoresAnteriores: null, valoresNuevos: { id: 5 } })).toEqual([{ campo: 'id', antes: undefined, despues: 5 }])
    expect(camposDelRegistro({ valoresAnteriores: { rol_id: 2 }, valoresNuevos: null })).toEqual([{ campo: 'rol_id', antes: 2, despues: undefined }])
  })

  it('los valores como texto', () => {
    expect([textoDelValor(null), textoDelValor(true), textoDelValor(false), textoDelValor(15.75), textoDelValor('CLI-000001')]).toEqual([
      null,
      'sí',
      'no',
      '15.75',
      'CLI-000001',
    ])
    expect(textoDelValor({ a: 1 })).toBe('{"a":1}')
  })
})

describe('el rango de días, en hora de Managua', () => {
  it('desde el primer instante del día hasta el último', () => {
    expect(inicioDelDia('2026-10-20')).toBe('2026-10-20T00:00:00-06:00')
    expect(finDelDia('2026-10-20')).toBe('2026-10-21T05:59:59.999Z') // 23:59:59.999 en Managua
  })
})

// Si la BD empieza a auditar otra tabla, o cambian las acciones, la interfaz debe saber nombrarlas.
describe('coincide con la BD y el backend', () => {
  it('las mismas tablas que audita schema.sql', () => {
    const lista = esquemaDeLaBd.match(/-- Tablas auditadas[\s\S]*?values([\s\S]*?)as t\(nombre, clave\)/)?.[1] ?? ''
    const tablas = [...lista.matchAll(/\('(\w+)', '[^']*'\)/g)].map(([, tabla]) => tabla)
    expect(tablas.sort()).toEqual(Object.keys(tablasAuditadas).sort())
  })

  it('las acciones del enum AccionAuditoria', () => {
    const cuerpo = enumeracionesDelBackend.match(/public enum AccionAuditoria\s*\{([^}]*)\}/)?.[1] ?? ''
    expect([...cuerpo.matchAll(/\b([A-Z]\w*)/g)].map(([, miembro]) => miembro.toUpperCase())).toEqual([...accionesDeAuditoria])
  })
})
