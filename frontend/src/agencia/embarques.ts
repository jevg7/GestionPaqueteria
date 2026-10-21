import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import type { Path } from 'react-hook-form'
import { z } from 'zod'
import type { Tono } from '../components/Etiqueta.tsx'
import { api, type Pagina } from '../lib/api.ts'
import { formatearDia, formatearFecha, formatearFechaHora, instanteEnManagua } from '../lib/formato.ts'
import { clavePaquetes, type Paquete } from './paquetes.ts'

/** Ciclo del embarque: ABIERTO → CERRADO → EN_TRANSITO → RECIBIDO; CANCELADO solo sin paquetes. */
export const estadosDeEmbarque = ['ABIERTO', 'CERRADO', 'EN_TRANSITO', 'RECIBIDO', 'CANCELADO'] as const

export type EstadoEmbarque = (typeof estadosDeEmbarque)[number]

// La API envía el código del estado: los nombres y colores son de la interfaz.
export const estadosDeEmbarqueVisibles: Record<EstadoEmbarque, { nombre: string; tono: Tono }> = {
  ABIERTO: { nombre: 'Abierto', tono: 'gris' },
  CERRADO: { nombre: 'Cerrado', tono: 'ambar' },
  EN_TRANSITO: { nombre: 'En tránsito', tono: 'azul' },
  RECIBIDO: { nombre: 'Recibido', tono: 'verde' },
  CANCELADO: { nombre: 'Cancelado', tono: 'rojo' },
}

/** ShipmentResponse del backend. Origen y destino de la ruta son códigos de ubicación (MIA, MGA). */
export type Embarque = {
  id: number
  codigoEmbarque: string
  metodoEnvio: { codigo: string; nombre: string }
  ruta: { id: number; nombre: string; origen: string; destino: string }
  estado: EstadoEmbarque
  fechaSalida: string | null
  /** Día del calendario ("yyyy-MM-dd"). */
  fechaLlegadaEstimada: string | null
  fechaLlegadaReal: string | null
  observaciones: string | null
  cantidadPaquetes: number
  creadoEn: string
  actualizadoEn: string
}

export const TAMANO_DE_PAGINA = 20

/** La API devuelve hasta 100 por página: al asignar se busca para encontrar los demás. */
export const PAQUETES_POR_BUSQUEDA = 100

/** AssignPackagesRequest admite hasta 500 paquetes por solicitud. */
export const MAXIMO_POR_ASIGNACION = 500

export type FiltrosEmbarques = { buscar: string; estado: EstadoEmbarque | ''; metodo: string; pagina: number }

/** Raíz de las claves de caché de los embarques: invalidarla refresca listas, detalles y sus paquetes. */
export const claveEmbarques = ['agencia', 'embarques'] as const

export function opcionesListaEmbarques({ buscar, estado, metodo, pagina }: FiltrosEmbarques) {
  return queryOptions({
    queryKey: [...claveEmbarques, 'lista', { buscar, estado, metodo, pagina }],
    queryFn: ({ signal }) =>
      api.get<Pagina<Embarque>>('/api/shipments', {
        params: { search: buscar, estado, metodoEnvio: metodo, page: pagina, pageSize: TAMANO_DE_PAGINA },
        signal,
      }),
    placeholderData: keepPreviousData,
  })
}

export function opcionesEmbarque(id: number) {
  return queryOptions({
    queryKey: [...claveEmbarques, 'detalle', id],
    queryFn: ({ signal }) => api.get<Embarque>(`/api/shipments/${id}`, { signal }),
  })
}

export function opcionesPaquetesDelEmbarque(id: number) {
  return queryOptions({
    queryKey: [...claveEmbarques, 'detalle', id, 'paquetes'],
    queryFn: ({ signal }) => api.get<Paquete[]>(`/api/shipments/${id}/packages`, { signal }),
  })
}

/** Los que se pueden asignar: recibidos en Miami y del método del embarque. Cuelga de las listas de paquetes. */
export function opcionesPaquetesParaAsignar(metodo: string, buscar: string) {
  return queryOptions({
    queryKey: [...clavePaquetes, 'lista', 'para-asignar', { metodo, buscar }],
    queryFn: ({ signal }) =>
      api.get<Pagina<Paquete>>('/api/packages', {
        params: { estado: 'RECIBIDO_EN_MIAMI', metodoEnvio: metodo, search: buscar, page: 1, pageSize: PAQUETES_POR_BUSQUEDA },
        signal,
      }),
    placeholderData: keepPreviousData,
  })
}

/**
 * En qué estados admite el embarque cada acción: los de ExigirEstado en EmbarquesService (embarques.test.ts los compara
 * con el archivo). La API vuelve a comprobarlo y responde 409 con el motivo.
 */
export const estadosQuePermiten = {
  editar: ['ABIERTO', 'CERRADO', 'EN_TRANSITO'],
  asignar: ['ABIERTO'],
  quitar: ['ABIERTO'],
  cerrar: ['ABIERTO'],
  registrarSalida: ['CERRADO'],
  registrarLlegada: ['EN_TRANSITO'],
  cancelar: ['ABIERTO', 'CERRADO'],
} as const satisfies Record<string, readonly EstadoEmbarque[]>

export type AccionDeEmbarque = keyof typeof estadosQuePermiten

/** Si el embarque admite la acción. Como en la API, cerrar exige al menos un paquete y cancelar, que no tenga ninguno. */
export function admite(embarque: Pick<Embarque, 'estado' | 'cantidadPaquetes'>, accion: AccionDeEmbarque): boolean {
  if (!(estadosQuePermiten[accion] as readonly EstadoEmbarque[]).includes(embarque.estado)) return false
  if (accion === 'cerrar') return embarque.cantidadPaquetes > 0
  if (accion === 'cancelar') return embarque.cantidadPaquetes === 0
  return true
}

export const textoDePaquetes = (cantidad: number) =>
  cantidad === 0 ? 'Sin paquetes' : cantidad === 1 ? '1 paquete' : `${cantidad} paquetes`

/** Las fechas que importan en cada etapa, para la lista: cuándo se creó, salió o llegó, y la llegada estimada. */
export function resumenDeFechas(embarque: Embarque): string {
  const { fechaSalida, fechaLlegadaReal, fechaLlegadaEstimada } = embarque
  const partes = [fechaSalida ? `Salió el ${formatearFecha(fechaSalida)}` : `Creado el ${formatearFecha(embarque.creadoEn)}`]
  if (fechaLlegadaReal) partes.push(`Llegó el ${formatearFecha(fechaLlegadaReal)}`)
  else if (fechaLlegadaEstimada && embarque.estado !== 'CANCELADO') partes.push(`Llegada estimada: ${formatearDia(fechaLlegadaEstimada)}`)
  return partes.join(' · ')
}

// Una fecha opcional de <input type="date">: vacía viaja como null.
const diaOpcional = z.string().transform((dia) => dia || null)

// CreateShipmentRequest. La ruta llega del <select> como texto.
export const esquemaNuevoEmbarque = z.object({
  metodoEnvio: z.string().min(1, 'El método de envío es obligatorio.'),
  rutaId: z.coerce.number<string>().int().min(1, 'La ruta es obligatoria.'),
  fechaLlegadaEstimada: diaOpcional,
  observaciones: z.string().trim(),
})

export type FormularioNuevoEmbarque = z.input<typeof esquemaNuevoEmbarque>
export type DatosNuevoEmbarque = z.output<typeof esquemaNuevoEmbarque>

export const camposDeNuevoEmbarque = [
  'metodoEnvio',
  'rutaId',
  'fechaLlegadaEstimada',
  'observaciones',
] as const satisfies readonly Path<FormularioNuevoEmbarque>[]

// UpdateShipmentRequest: lo único que se edita, mientras el embarque no haya llegado ni se haya cancelado.
export const esquemaEdicionEmbarque = z.object({ fechaLlegadaEstimada: diaOpcional, observaciones: z.string().trim() })

export type FormularioEdicionEmbarque = z.input<typeof esquemaEdicionEmbarque>
export type DatosEdicionEmbarque = z.output<typeof esquemaEdicionEmbarque>

export const camposDeEdicionEmbarque = ['fechaLlegadaEstimada', 'observaciones'] as const satisfies readonly Path<FormularioEdicionEmbarque>[]

export const datosDeEmbarque = (embarque: Embarque): FormularioEdicionEmbarque => ({
  fechaLlegadaEstimada: embarque.fechaLlegadaEstimada ?? '',
  observaciones: embarque.observaciones ?? '',
})

/** El margen de FechasDelNegocio para relojes desfasados. */
const TOLERANCIA_DEL_RELOJ = 5 * 60_000

/**
 * La fecha de salida o de llegada (ShipmentEventRequest), escrita en hora de Managua. Vacía es "ahora" (null); puede ser
 * pasada, nunca futura, y la llegada no puede ser anterior a la salida.
 */
export function esquemaFechaDelHecho(hecho: 'salida' | 'llegada', salida: string | null = null, ahora = () => Date.now()) {
  return z.object({
    fecha: z
      .string()
      .transform((valor) => (valor ? instanteEnManagua(valor) : null))
      .refine(
        (instante) => instante === null || Date.parse(instante) <= ahora() + TOLERANCIA_DEL_RELOJ,
        `La fecha de ${hecho} no puede ser futura.`,
      )
      .refine(
        (instante) => instante === null || salida === null || Date.parse(instante) >= Date.parse(salida),
        salida ? `La llegada no puede ser anterior a la salida (${formatearFechaHora(salida)}).` : undefined,
      ),
  })
}

export type FormularioFechaDelHecho = z.input<ReturnType<typeof esquemaFechaDelHecho>>
export type DatosFechaDelHecho = z.output<ReturnType<typeof esquemaFechaDelHecho>>

export const crearEmbarque = (datos: DatosNuevoEmbarque) => api.post<Embarque>('/api/shipments', datos)
export const editarEmbarque = (id: number, datos: DatosEdicionEmbarque) => api.put<Embarque>(`/api/shipments/${id}`, datos)
export const asignarPaquetes = (id: number, paqueteIds: number[]) => api.post<Embarque>(`/api/shipments/${id}/packages`, { paqueteIds })
export const quitarPaquete = (id: number, paqueteId: number) => api.post<Embarque>(`/api/shipments/${id}/packages/${paqueteId}/remove`)
export const cerrarEmbarque = (id: number) => api.post<Embarque>(`/api/shipments/${id}/close`)
export const registrarSalida = (id: number, fecha: string | null) => api.post<Embarque>(`/api/shipments/${id}/depart`, { fecha })
export const registrarLlegada = (id: number, fecha: string | null) => api.post<Embarque>(`/api/shipments/${id}/arrive`, { fecha })
export const cancelarEmbarque = (id: number) => api.post<Embarque>(`/api/shipments/${id}/cancel`)
