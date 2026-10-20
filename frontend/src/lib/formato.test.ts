import { describe, expect, it } from 'vitest'
import { formatearFecha, formatearFechaHora } from './formato.ts'

describe('fechas en hora de Managua (UTC−6)', () => {
  it('las 03:00 UTC todavía son el día anterior en Managua', () => {
    // 2026-10-21 03:00 UTC = 2026-10-20 21:00 en Managua.
    expect(formatearFecha('2026-10-21T03:00:00Z')).toBe(formatearFecha('2026-10-20T12:00:00Z'))
    expect(formatearFecha('2026-10-21T03:00:00Z')).not.toBe(formatearFecha('2026-10-21T12:00:00Z'))
  })

  it('la hora se muestra en Managua', () => {
    expect(formatearFechaHora('2026-10-20T18:30:00Z')).toContain('12:30')
  })
})
