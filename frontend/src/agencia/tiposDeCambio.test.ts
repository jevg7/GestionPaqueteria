import type { QueryFunctionContext } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api.ts'
import { ApiError } from '../lib/errores.ts'
import { esquemaTipoDeCambio, opcionesTipoDeCambioVigente, textoTipoDeCambio } from './tiposDeCambio.ts'

vi.mock('../lib/api.ts', () => ({ api: { get: vi.fn(), put: vi.fn() } }))

const contexto = { signal: new AbortController().signal } as unknown as QueryFunctionContext<readonly unknown[]>
const vigente = () => opcionesTipoDeCambioVigente.queryFn!(contexto as never)

describe('tipo de cambio vigente', () => {
  it('sin ninguno registrado (404) es null, no un error', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new ApiError(404))
    await expect(vigente()).resolves.toBeNull()
  })

  it('otro error sí es un error', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new ApiError(503))
    await expect(vigente()).rejects.toMatchObject({ status: 503 })
  })
})

describe('esquemaTipoDeCambio (ExchangeRateRequest)', () => {
  it('convierte los córdobas por dólar en número', () => {
    expect(esquemaTipoDeCambio.parse({ fecha: '2026-10-20', nioPorUsd: '36.6243' })).toEqual({ fecha: '2026-10-20', nioPorUsd: 36.6243 })
  })

  it('rechaza el formato equivocado y el cero', () => {
    const mensaje = (nioPorUsd: string) => esquemaTipoDeCambio.safeParse({ fecha: '2026-10-20', nioPorUsd }).error?.issues[0].message
    expect(mensaje('36,62')).toBe('Escriba el tipo de cambio con punto decimal y hasta 4 decimales (por ejemplo, 36.6243).')
    expect(mensaje('36.62431')).toBe('Escriba el tipo de cambio con punto decimal y hasta 4 decimales (por ejemplo, 36.6243).')
    expect(mensaje('0')).toBe('El tipo de cambio debe ser mayor que cero.')
  })

  it('muestra el valor con 2 a 4 decimales', () => {
    expect(textoTipoDeCambio({ fecha: '2026-10-20', nioPorUsd: 36.61, creadoPorUsuarioId: 7, actualizadoEn: '' })).toBe('36.61 córdobas por dólar')
  })
})
