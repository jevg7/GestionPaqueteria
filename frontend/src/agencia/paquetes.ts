import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import type { Path } from 'react-hook-form'
import { z } from 'zod'
import type { Tono } from '../components/Etiqueta.tsx'
import { api, type Pagina } from '../lib/api.ts'
import { productoRedondeado } from '../lib/dinero.ts'
import { formatearDolares, formatearLibras, formatearNumero } from '../lib/formato.ts'
import { decimalPositivo, textoOpcional } from '../lib/validacion.ts'
import { referenciaDe, type ReferenciaCliente } from './clientes.ts'

/** Los estados del paquete (catálogo estados_paquete), en el orden del flujo. */
export const estadosDePaquete = [
  'REGISTRADO',
  'RECIBIDO_EN_MIAMI',
  'PENDIENTE_DE_ENVIO',
  'EN_TRANSITO',
  'RECIBIDO_EN_NICARAGUA',
  'PENDIENTE_DE_PAGO',
  'PAGADO',
  'LISTO_PARA_ENTREGA',
  'EN_REPARTO',
  'ENTREGADO',
  'CANCELADO',
] as const

export type EstadoPaquete = (typeof estadosDePaquete)[number]

type ReferenciaEstado = { id: number; codigo: EstadoPaquete; nombre: string }

/** PackageResponse del backend. */
export type Paquete = {
  id: number
  codigoPaquete: string
  cliente: ReferenciaCliente
  trackingExterno: string | null
  tienda: string | null
  descripcion: string
  metodoEnvio: { codigo: string; nombre: string }
  estado: ReferenciaEstado
  codigoEmbarque: string | null
  pesoLb: number | null
  tarifaAplicada: number | null
  montoCalculado: number | null
  fechaRegistro: string
  fechaRecepcionMiami: string | null
  fechaRecepcionNicaragua: string | null
  actualizadoEn: string
}

/** PackageHistoryEntry: un cambio de estado, quién lo hizo y cuándo. */
export type EntradaDeHistorial = {
  id: number
  fecha: string
  estado: ReferenciaEstado
  usuarioId: number
  usuario: string
  observacion: string | null
}

export const TAMANO_DE_PAGINA = 20

export type FiltrosPaquetes = {
  buscar: string
  estado: EstadoPaquete | ''
  clienteId: number | null
  metodo: string
  pagina: number
}

/** Raíz de las claves de caché de los paquetes: invalidarla refresca listas, detalles e historiales. */
export const clavePaquetes = ['agencia', 'paquetes'] as const

export function opcionesListaPaquetes({ buscar, estado, clienteId, metodo, pagina }: FiltrosPaquetes) {
  return queryOptions({
    queryKey: [...clavePaquetes, 'lista', { buscar, estado, clienteId, metodo, pagina }],
    queryFn: ({ signal }) =>
      api.get<Pagina<Paquete>>('/api/packages', {
        params: { search: buscar, estado, clienteId, metodoEnvio: metodo, page: pagina, pageSize: TAMANO_DE_PAGINA },
        signal,
      }),
    placeholderData: keepPreviousData,
  })
}

export function opcionesPaquete(id: number) {
  return queryOptions({
    queryKey: [...clavePaquetes, 'detalle', id],
    queryFn: ({ signal }) => api.get<Paquete>(`/api/packages/${id}`, { signal }),
  })
}

/** Su clave cuelga de la del detalle: invalidar el detalle de un paquete también refresca su historial. */
export function opcionesHistorialPaquete(id: number) {
  return queryOptions({
    queryKey: [...clavePaquetes, 'detalle', id, 'historial'],
    queryFn: ({ signal }) => api.get<EntradaDeHistorial[]>(`/api/packages/${id}/history`, { signal }),
  })
}

// Qué acción se ofrece en cada estado: la tabla de TransicionesPaquete y las reglas de PaquetesService (la API las
// vuelve a comprobar). paquetes.test.ts compara estados finales y cancelables con TransicionesPaquete.cs.
export const esFinal = (estado: EstadoPaquete) => estado === 'ENTREGADO' || estado === 'CANCELADO'

/** Cliente y método solo se cambian antes de asignar el paquete a un embarque. */
export const permiteCambiarClienteYMetodo = (estado: EstadoPaquete) =>
  estado === 'REGISTRADO' || estado === 'RECIBIDO_EN_MIAMI'

/** Se cancela mientras está en Miami; si ya estaba en un embarque, la API lo quita de él. */
export const sePuedeCancelar = (estado: EstadoPaquete) =>
  estado === 'REGISTRADO' || estado === 'RECIBIDO_EN_MIAMI' || estado === 'PENDIENTE_DE_ENVIO'

/** Solo un REGISTRADO: uno que está en un embarque vuelve a la bodega quitándolo del embarque. */
export const sePuedeRecibirEnMiami = (estado: EstadoPaquete) => estado === 'REGISTRADO'

/** Se pesa al llegar a Nicaragua; en PENDIENTE_DE_PAGO se corrige el peso si no está facturado (eso lo dice la API). */
export const sePuedePesar = (estado: EstadoPaquete) => estado === 'RECIBIDO_EN_NICARAGUA' || estado === 'PENDIENTE_DE_PAGO'

export const tonosDeEstado: Record<EstadoPaquete, Tono> = {
  REGISTRADO: 'gris',
  RECIBIDO_EN_MIAMI: 'azul',
  PENDIENTE_DE_ENVIO: 'azul',
  EN_TRANSITO: 'azul',
  RECIBIDO_EN_NICARAGUA: 'azul',
  PENDIENTE_DE_PAGO: 'ambar',
  PAGADO: 'verde',
  LISTO_PARA_ENTREGA: 'verde',
  EN_REPARTO: 'azul',
  ENTREGADO: 'verde',
  CANCELADO: 'rojo',
}

/** round(peso × tarifa, 2), como CalculoMonto.Calcular: la vista previa del pesaje (el monto lo calcula la API). */
export const montoEstimado = (pesoLb: number, precioPorLibra: number) => productoRedondeado(pesoLb, precioPorLibra)

/** "4.50 lb × 3.50 USD/lb = 15.75 USD", o null si todavía no se pesó. */
export function textoDelCalculo({ pesoLb, tarifaAplicada, montoCalculado }: Paquete): string | null {
  if (pesoLb === null || tarifaAplicada === null || montoCalculado === null) return null
  return `${formatearLibras(pesoLb)} × ${formatearNumero(tarifaAplicada)} USD/lb = ${formatearDolares(montoCalculado)}`
}

const referenciaCliente = z.object({ id: z.number(), codigoCliente: z.string(), nombres: z.string(), apellidos: z.string() })

// Las reglas y mensajes de PackageRequest. Del cliente se guarda su referencia para mostrarlo; a la API va su id.
export const esquemaPaquete = z.object({
  cliente: referenciaCliente.nullable().transform((cliente, contexto) => {
    if (cliente) return cliente
    contexto.addIssue({ code: 'custom', message: 'El cliente es obligatorio.' })
    return z.NEVER
  }),
  metodoEnvio: z.string().min(1, 'El método de envío es obligatorio.'),
  trackingExterno: textoOpcional(100, 'El tracking admite hasta 100 caracteres.'),
  tienda: textoOpcional(100, 'La tienda admite hasta 100 caracteres.'),
  descripcion: z.string().trim().min(1, 'La descripción es obligatoria.'),
})

export type FormularioPaquete = z.input<typeof esquemaPaquete>
export type DatosPaquete = z.output<typeof esquemaPaquete>

export const camposDePaquete = ['metodoEnvio', 'trackingExterno', 'tienda', 'descripcion'] as const satisfies readonly Path<FormularioPaquete>[]

export const paqueteVacio = (cliente: ReferenciaCliente | null): FormularioPaquete => ({
  cliente,
  metodoEnvio: '',
  trackingExterno: '',
  tienda: '',
  descripcion: '',
})

export function datosDePaquete(paquete: Paquete): FormularioPaquete {
  return {
    cliente: referenciaDe(paquete.cliente),
    metodoEnvio: paquete.metodoEnvio.codigo,
    trackingExterno: paquete.trackingExterno ?? '',
    tienda: paquete.tienda ?? '',
    descripcion: paquete.descripcion,
  }
}

/** PackageRequest: el id del cliente; tracking y tienda vacíos viajan como "" y la API los guarda como null. */
export const cuerpoDelPaquete = ({ cliente, ...datos }: DatosPaquete) => ({ clienteId: cliente.id, ...datos })

// WeighPackageRequest: de 0.01 a 99999999.99 libras con hasta 2 decimales (peso_lb es NUMERIC(10,2)).
export const esquemaPesaje = z.object({
  pesoLb: decimalPositivo(2, {
    vacio: 'Indique el peso en libras.',
    formato: 'Escriba el peso con punto decimal y hasta 2 decimales (por ejemplo, 4.50).',
    cero: 'El peso debe ser mayor que cero.',
  }),
})

export type FormularioPesaje = z.input<typeof esquemaPesaje>
export type DatosPesaje = z.output<typeof esquemaPesaje>

export const esquemaCancelacion = z.object({
  motivo: z.string().trim().min(1, 'El motivo de la cancelación es obligatorio.'),
})

export type DatosCancelacion = z.output<typeof esquemaCancelacion>

export const esquemaRecepcion = z.object({ observacion: z.string().trim() })

export type DatosRecepcion = z.output<typeof esquemaRecepcion>

export const registrarPaquete = (datos: DatosPaquete) => api.post<Paquete>('/api/packages', cuerpoDelPaquete(datos))
export const editarPaquete = (id: number, datos: DatosPaquete) => api.put<Paquete>(`/api/packages/${id}`, cuerpoDelPaquete(datos))
export const recibirEnMiami = (id: number, observacion: string) =>
  api.post<Paquete>(`/api/packages/${id}/receive-miami`, { observacion })
export const pesarPaquete = (id: number, pesoLb: number) => api.post<Paquete>(`/api/packages/${id}/weigh`, { pesoLb })
export const cancelarPaquete = (id: number, motivo: string) => api.post<Paquete>(`/api/packages/${id}/cancel`, { motivo })
