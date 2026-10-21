import { describe, expect, it } from 'vitest'
import {
  formatearDia,
  formatearDolares,
  formatearFecha,
  formatearFechaHora,
  formatearLibras,
  formatearNumero,
  fechaHoraEnManagua,
  hoyEnManagua,
  instanteEnManagua,
} from './formato.ts'

describe('instantes en hora de Managua (UTC−6)', () => {
  it('las 03:00 UTC todavía son el día anterior en Managua', () => {
    // 2026-10-21 03:00 UTC = 2026-10-20 21:00 en Managua.
    expect(formatearFecha('2026-10-21T03:00:00Z')).toBe(formatearFecha('2026-10-20T12:00:00Z'))
    expect(formatearFecha('2026-10-21T03:00:00Z')).not.toBe(formatearFecha('2026-10-21T12:00:00Z'))
  })

  it('la hora se muestra en Managua', () => {
    expect(formatearFechaHora('2026-10-20T18:30:00Z')).toContain('12:30')
  })
})

describe('días del calendario', () => {
  it('un día se muestra tal cual, sin convertirlo de zona (el 1 de enero no pasa a ser 31 de diciembre)', () => {
    expect(formatearDia('2026-01-01')).toContain('2026')
    expect(formatearDia('2026-01-01')).not.toContain('31')
  })

  it('hoy en Managua cambia a medianoche de Managua, no de UTC', () => {
    expect(hoyEnManagua(new Date('2026-10-21T03:00:00Z'))).toBe('2026-10-20')
    expect(hoyEnManagua(new Date('2026-10-21T06:00:00Z'))).toBe('2026-10-21')
  })
})

describe('formatearNumero', () => {
  it('muestra entre 2 y 4 decimales', () => {
    expect(formatearNumero(3.5)).toBe('3.50')
    expect(formatearNumero(36.6243)).toBe('36.6243')
    expect(formatearNumero(36.62436)).toBe('36.6244')
  })
})

describe('pesos y montos', () => {
  it('siempre con 2 decimales y su unidad', () => {
    expect(formatearLibras(4.5)).toBe('4.50 lb')
    expect(formatearLibras(12)).toBe('12.00 lb')
    expect(formatearDolares(15.75)).toBe('15.75 USD')
    expect(formatearDolares(1234.5)).toBe('1,234.50 USD')
  })
})

describe('fecha y hora escritas en hora de Managua (salidas y llegadas)', () => {
  it('el valor de <input type="datetime-local"> es la hora de Managua, de 00 a 23', () => {
    expect(fechaHoraEnManagua(new Date('2026-10-21T03:05:00Z'))).toBe('2026-10-20T21:05')
    expect(fechaHoraEnManagua(new Date('2026-10-21T06:00:00Z'))).toBe('2026-10-21T00:00')
  })

  it('lo escrito se envía con el desfase de Managua, sin importar la zona del equipo', () => {
    expect(instanteEnManagua('2026-10-20T21:05')).toBe('2026-10-20T21:05:00-06:00')
    expect(Date.parse(instanteEnManagua('2026-10-20T21:05'))).toBe(Date.parse('2026-10-21T03:05:00Z'))
    expect(fechaHoraEnManagua(new Date(instanteEnManagua('2026-01-15T08:30')))).toBe('2026-01-15T08:30')
  })
})
