import { queryOptions } from '@tanstack/react-query'
import type { Path } from 'react-hook-form'
import { z } from 'zod'
import { api } from '../lib/api.ts'
import { ApiError } from '../lib/errores.ts'
import { formatearNumero } from '../lib/formato.ts'
import { decimalPositivo, diaObligatorio } from '../lib/validacion.ts'

/** ExchangeRateResponse del backend: córdobas por dólar de un día. */
export type TipoDeCambio = { fecha: string; nioPorUsd: number; creadoPorUsuarioId: number; actualizadoEn: string }

/** Raíz de las claves de caché del tipo de cambio: invalidarla refresca el vigente y los últimos. */
export const claveTiposDeCambio = ['agencia', 'tiposDeCambio'] as const

/** El que se aplica hoy (el más reciente con fecha ≤ hoy en Managua); null si no hay ninguno (la API da 404). */
export const opcionesTipoDeCambioVigente = queryOptions({
  queryKey: [...claveTiposDeCambio, 'vigente'],
  queryFn: async ({ signal }) => {
    try {
      return await api.get<TipoDeCambio>('/api/exchange-rates/current', { signal })
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null
      throw error
    }
  },
})

/** Los últimos 60 registrados, del más reciente al más antiguo (incluye días futuros ya cargados). */
export const opcionesUltimosTiposDeCambio = queryOptions({
  queryKey: [...claveTiposDeCambio, 'ultimos'],
  queryFn: ({ signal }) => api.get<TipoDeCambio[]>('/api/exchange-rates', { signal }),
})

/** Las reglas de ExchangeRateRequest: mayor que cero y hasta 4 decimales. */
export const esquemaTipoDeCambio = z.object({
  fecha: diaObligatorio('Indique el día.'),
  nioPorUsd: decimalPositivo(4, {
    vacio: 'Indique los córdobas por dólar.',
    formato: 'Escriba el tipo de cambio con punto decimal y hasta 4 decimales (por ejemplo, 36.6243).',
    cero: 'El tipo de cambio debe ser mayor que cero.',
  }),
})

export type FormularioTipoDeCambio = z.input<typeof esquemaTipoDeCambio>
export type DatosTipoDeCambio = z.output<typeof esquemaTipoDeCambio>

export const camposDeTipoDeCambio = ['fecha', 'nioPorUsd'] as const satisfies readonly Path<FormularioTipoDeCambio>[]

export const textoTipoDeCambio = (tipo: TipoDeCambio) => `${formatearNumero(tipo.nioPorUsd)} córdobas por dólar`

/** Registra o corrige el de un día (PUT idempotente por fecha). */
export const registrarTipoDeCambio = ({ fecha, nioPorUsd }: DatosTipoDeCambio) =>
  api.put<TipoDeCambio>(`/api/exchange-rates/${fecha}`, { nioPorUsd })
