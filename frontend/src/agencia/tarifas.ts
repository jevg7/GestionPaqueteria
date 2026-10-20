import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import type { Path } from 'react-hook-form'
import { z } from 'zod'
import { api } from '../lib/api.ts'
import { formatearDia, formatearNumero } from '../lib/formato.ts'
import { decimalPositivo, diaObligatorio } from '../lib/validacion.ts'

export type EstadoTarifa = 'PROGRAMADA' | 'VIGENTE' | 'VENCIDA' | 'ANULADA'

/** RateResponse del backend. El estado lo calcula la API respecto de hoy en Managua. */
export type Tarifa = {
  id: number
  metodoEnvio: { codigo: string; nombre: string }
  precioPorUnidad: number
  unidad: 'LB'
  moneda: 'USD'
  fechaInicio: string
  fechaFin: string | null
  estado: EstadoTarifa
  creadoPorUsuarioId: number | null
  creadoEn: string
}

/** CurrentRateResponse: la tarifa de hoy de un método; null si no hay (no se pueden pesar paquetes de ese método). */
export type TarifaDeHoy = { metodoEnvio: { codigo: string; nombre: string }; tarifa: Tarifa | null }

export type FiltrosTarifas = { metodo: string; incluirAnuladas: boolean }

/** Raíz de las claves de caché de las tarifas: invalidarla refresca las de hoy y el historial. */
export const claveTarifas = ['agencia', 'tarifas'] as const

export const opcionesTarifasDeHoy = queryOptions({
  queryKey: [...claveTarifas, 'hoy'],
  queryFn: ({ signal }) => api.get<TarifaDeHoy[]>('/api/rates/current', { signal }),
})

export function opcionesHistorialTarifas({ metodo, incluirAnuladas }: FiltrosTarifas) {
  return queryOptions({
    queryKey: [...claveTarifas, 'historial', { metodo, incluirAnuladas }],
    queryFn: ({ signal }) =>
      api.get<Tarifa[]>('/api/rates', { params: { metodoEnvio: metodo, incluirAnuladas: incluirAnuladas || undefined }, signal }),
    placeholderData: keepPreviousData,
  })
}

/** Las reglas de CreateRateRequest y de TarifasService (rige desde hoy en adelante, en hora de Managua). */
export function esquemaNuevaTarifa(hoy: string) {
  return z.object({
    metodoEnvio: z.string().min(1, 'El método de envío es obligatorio.'),
    precioPorUnidad: decimalPositivo(4, {
      vacio: 'Indique el precio por libra.',
      formato: 'Escriba el precio con punto decimal y hasta 4 decimales (por ejemplo, 3.50).',
      cero: 'El precio debe ser mayor que cero.',
    }),
    fechaInicio: diaObligatorio('Indique desde qué día rige.').refine(
      (dia) => dia >= hoy,
      `Una tarifa rige desde hoy en adelante: la fecha no puede ser anterior al ${formatearDia(hoy)}.`,
    ),
  })
}

export type FormularioNuevaTarifa = z.input<ReturnType<typeof esquemaNuevaTarifa>>
export type DatosNuevaTarifa = z.output<ReturnType<typeof esquemaNuevaTarifa>>

export const camposDeNuevaTarifa = ['metodoEnvio', 'precioPorUnidad', 'fechaInicio'] as const satisfies readonly Path<FormularioNuevaTarifa>[]

export const precioDeTarifa = (tarifa: Tarifa) => `${formatearNumero(tarifa.precioPorUnidad)} USD por libra`

export function vigenciaDeTarifa(tarifa: Tarifa): string {
  return tarifa.fechaFin
    ? `del ${formatearDia(tarifa.fechaInicio)} al ${formatearDia(tarifa.fechaFin)}`
    : `desde el ${formatearDia(tarifa.fechaInicio)}`
}

/** La API anula una programada, o una vigente que no se aplicó a paquetes (esto último lo decide ella: 409). */
export const sePuedeAnular = (tarifa: Tarifa) => tarifa.estado === 'PROGRAMADA' || tarifa.estado === 'VIGENTE'

export const crearTarifa = (datos: DatosNuevaTarifa) => api.post<Tarifa>('/api/rates', datos)
export const anularTarifa = (id: number) => api.post(`/api/rates/${id}/void`)
