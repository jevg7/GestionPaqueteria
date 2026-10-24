import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import type { Path } from 'react-hook-form'
import { z } from 'zod'
import type { Rol } from '../auth/identidad.ts'
import type { Tono } from '../components/Etiqueta.tsx'
import { api, type Pagina } from '../lib/api.ts'
import { productoRedondeado, sumaDeMontos } from '../lib/dinero.ts'
import { instanteEnManagua } from '../lib/formato.ts'
import { esquemaDeMotivo, fechaDelHecho, textoObligatorio, textoOpcional } from '../lib/validacion.ts'
import { esMetodoDePago, monedas, type MetodoDePago, type Moneda, type Pago } from './facturas.ts'
import { clavePaquetes, type Paquete } from './paquetes.ts'
import { claveUsuarios, type Usuario } from './usuarios.ts'

/** Ciclo de un delivery: PENDIENTE → EN_RUTA → ENTREGADA o FALLIDA; CANCELADA si no salió. Un retiro nace ENTREGADA. */
export const estadosDeEntrega = ['PENDIENTE', 'EN_RUTA', 'ENTREGADA', 'FALLIDA', 'CANCELADA'] as const
export type EstadoEntrega = (typeof estadosDeEntrega)[number]

export const estadosDeEntregaVisibles: Record<EstadoEntrega, { nombre: string; tono: Tono }> = {
  PENDIENTE: { nombre: 'Por salir', tono: 'ambar' },
  EN_RUTA: { nombre: 'En ruta', tono: 'azul' },
  ENTREGADA: { nombre: 'Entregada', tono: 'verde' },
  FALLIDA: { nombre: 'Fallida', tono: 'rojo' },
  CANCELADA: { nombre: 'Cancelada', tono: 'gris' },
}

export const tiposDeEntrega = ['RETIRO_EN_AGENCIA', 'DELIVERY'] as const
export type TipoEntrega = (typeof tiposDeEntrega)[number]

export const nombresDeTipoDeEntrega: Record<TipoEntrega, string> = { RETIRO_EN_AGENCIA: 'Retiro en agencia', DELIVERY: 'Delivery' }

/** PendingCharge: el saldo (USD) de la factura del paquete, que se cobra contra entrega. */
export type CobroPendiente = { facturaId: number; numeroFactura: string; saldoUsd: number }

/** DeliveryResponse: la entrega de un paquete; una visita junta las de un mismo cliente. */
export type Entrega = {
  id: number
  paquete: { id: number; codigoPaquete: string; descripcion: string; estado: { id: number; codigo: string; nombre: string } }
  cliente: { id: number; codigoCliente: string; nombres: string; apellidos: string; telefono: string }
  tipoEntrega: TipoEntrega
  estado: EstadoEntrega
  direccion: string | null
  fechaProgramada: string | null
  fechaEntrega: string | null
  personaRecibe: string | null
  responsable: { id: number; nombre: string } | null
  observaciones: string | null
  cobroPendiente: CobroPendiente | null
  creadoPorUsuarioId: number
  creadoEn: string
  actualizadoEn: string
}

export const TAMANO_DE_PAGINA = 20

/** Las en curso de un estado se piden hasta 100 (la página máxima de la API); más allá, el historial. */
export const ENTREGAS_EN_CURSO = 100

export type FiltrosEntregas = { estado: EstadoEntrega | ''; tipo: TipoEntrega | ''; clienteId: number | null; pagina: number }

/** Raíz de las claves de caché de las entregas. Un REPARTIDOR recibe de la API solo las suyas. */
export const claveEntregas = ['agencia', 'entregas'] as const

export function opcionesListaEntregas({ estado, tipo, clienteId, pagina }: FiltrosEntregas) {
  return queryOptions({
    queryKey: [...claveEntregas, 'lista', { estado, tipo, clienteId, pagina }],
    queryFn: ({ signal }) =>
      api.get<Pagina<Entrega>>('/api/deliveries', {
        params: { estado, tipoEntrega: tipo, clienteId, page: pagina, pageSize: TAMANO_DE_PAGINA },
        signal,
      }),
    placeholderData: keepPreviousData,
  })
}

/** Las que siguen en curso en un estado (por salir o en ruta), para operarlas. */
export function opcionesEntregasEn(estado: 'PENDIENTE' | 'EN_RUTA') {
  return queryOptions({
    queryKey: [...claveEntregas, 'en-curso', estado],
    queryFn: ({ signal }) => api.get<Pagina<Entrega>>('/api/deliveries', { params: { estado, page: 1, pageSize: ENTREGAS_EN_CURSO }, signal }),
  })
}

/** Las por salir de un cliente: esos paquetes ya tienen un intento vigente y no se programan de nuevo. */
export function opcionesEntregasPorSalirDelCliente(clienteId: number) {
  return queryOptions({
    queryKey: [...claveEntregas, 'por-salir', clienteId],
    queryFn: ({ signal }) =>
      api.get<Pagina<Entrega>>('/api/deliveries', { params: { clienteId, estado: 'PENDIENTE', page: 1, pageSize: 100 }, signal }),
  })
}

/** Los paquetes del cliente listos para entregar. Cuelga de las listas de paquetes. */
export function opcionesPaquetesListosDelCliente(clienteId: number) {
  return queryOptions({
    queryKey: [...clavePaquetes, 'lista', 'listos', clienteId],
    queryFn: ({ signal }) =>
      api.get<Pagina<Paquete>>('/api/packages', { params: { clienteId, estado: 'LISTO_PARA_ENTREGA', page: 1, pageSize: 100 }, signal }),
  })
}

/** Los repartidores activos. Salen de /api/users, que solo puede pedir el ADMIN (permiso AdministrarUsuarios). */
export const opcionesRepartidores = queryOptions({
  queryKey: [...claveUsuarios, 'repartidores'],
  queryFn: async ({ signal }) =>
    (await api.get<Pagina<Usuario>>('/api/users', { params: { rol: 'REPARTIDOR', activo: true, page: 1, pageSize: 100 }, signal })).items,
  staleTime: 60_000,
})

/**
 * En qué estado admite la entrega cada acción: los de ExigirEstado en EntregasService (entregas.test.ts los compara con
 * el archivo). La API vuelve a comprobarlo, y también que un repartidor opere solo las suyas.
 */
export const estadoQuePermite = {
  salirARuta: 'PENDIENTE',
  confirmar: 'EN_RUTA',
  marcarFallida: 'EN_RUTA',
  cancelar: 'PENDIENTE',
} as const satisfies Record<string, EstadoEntrega>

/**
 * REPARTIDOR sin rol de ADMIN ni AGENTE (SoloRepartidor en EntregasService): la API le muestra solo sus entregas y, al
 * salir a ruta, quedan a su nombre. ADMIN y AGENTE operan en nombre de cualquier repartidor.
 */
export const esSoloRepartidor = (roles: readonly Rol[]) =>
  roles.includes('REPARTIDOR') && !roles.includes('ADMIN') && !roles.includes('AGENTE')

/** Una visita: las entregas de un mismo cliente, en el mismo estado, dirección y repartidor. Se operan juntas. */
export type Visita = {
  clave: string
  cliente: Entrega['cliente']
  estado: EstadoEntrega
  direccion: string | null
  responsable: Entrega['responsable']
  fechaProgramada: string | null
  entregas: Entrega[]
}

export function agruparEnVisitas(entregas: readonly Entrega[]): Visita[] {
  const visitas = new Map<string, Visita>()
  for (const entrega of entregas) {
    const clave = [entrega.estado, entrega.cliente.id, entrega.responsable?.id ?? '', entrega.direccion ?? ''].join('|')
    const visita = visitas.get(clave)
    if (visita) visita.entregas.push(entrega)
    else {
      const { cliente, estado, direccion, responsable, fechaProgramada } = entrega
      visitas.set(clave, { clave, cliente, estado, direccion, responsable, fechaProgramada, entregas: [entrega] })
    }
  }
  // Las visitas, en el orden de la API (las más recientes primero); sus paquetes, en el orden en que se registraron.
  return [...visitas.values()].map((visita) => ({ ...visita, entregas: visita.entregas.toSorted((a, b) => a.id - b.id) }))
}

/** Lo que se cobra contra entrega en la visita: el saldo de cada factura una sola vez (varios paquetes la comparten). */
export function cobroDeLaVisita(entregas: readonly Entrega[]): { facturas: CobroPendiente[]; totalUsd: number } {
  const facturas = [
    ...new Map(entregas.flatMap((entrega) => (entrega.cobroPendiente ? [[entrega.cobroPendiente.facturaId, entrega.cobroPendiente] as const] : []))).values(),
  ]
  return { facturas, totalUsd: sumaDeMontos(facturas.map((factura) => factura.saldoUsd)) }
}

/** En córdobas, la API cobra cada factura por separado a su equivalente exacto (CobrarSaldoAsync): la suma de ellos. */
export const cobroEnCordobas = (facturas: readonly CobroPendiente[], tipoDeCambio: number) =>
  sumaDeMontos(facturas.map((factura) => productoRedondeado(factura.saldoUsd, tipoDeCambio)))

const personaRecibe = textoObligatorio('Indique quién recibe.', 150, 'El nombre de quien recibe admite hasta 150 caracteres.')

/** PickupRequest: el cliente (o su autorizado) se lleva paquetes ya pagados. */
export const esquemaRetiro = z.object({ personaRecibe, fecha: fechaDelHecho('entrega'), observaciones: z.string().trim() })

export type FormularioRetiro = z.input<typeof esquemaRetiro>
export type DatosRetiro = z.output<typeof esquemaRetiro>

export const camposDeRetiro = ['personaRecibe', 'fecha', 'observaciones'] as const satisfies readonly Path<FormularioRetiro>[]

/** ScheduleDeliveryRequest. La dirección llega con la del cliente; el repartidor es opcional al programar. */
export const esquemaDelivery = z.object({
  direccion: z.string().trim().min(1, 'Indique la dirección de entrega.'),
  fechaProgramada: z.string().transform((valor) => (valor ? instanteEnManagua(valor) : null)),
  responsableUsuarioId: z.string().transform((id) => (id ? Number(id) : null)),
  observaciones: z.string().trim(),
})

export type FormularioDelivery = z.input<typeof esquemaDelivery>
export type DatosDelivery = z.output<typeof esquemaDelivery>

export const camposDeDelivery = [
  'direccion',
  'fechaProgramada',
  'responsableUsuarioId',
  'observaciones',
] as const satisfies readonly Path<FormularioDelivery>[]

/** DeliverRequest: quién recibe, cuándo y, si hay saldo, cómo se cobra (CollectOnDeliveryRequest). */
export function esquemaConfirmacion(conCobro: boolean, ahora?: () => number) {
  return z.object({
    personaRecibe,
    fecha: fechaDelHecho('entrega', undefined, ahora),
    moneda: z.enum(monedas),
    metodoPago: z.string().refine((metodo) => !conCobro || esMetodoDePago(metodo), 'Elija el método de pago.'),
    referencia: textoOpcional(100, 'La referencia admite hasta 100 caracteres.'),
  })
}

export type FormularioConfirmacion = z.input<ReturnType<typeof esquemaConfirmacion>>
export type DatosConfirmacion = z.output<ReturnType<typeof esquemaConfirmacion>>

export const camposDeConfirmacion = [
  'personaRecibe',
  'fecha',
  'moneda',
  'metodoPago',
  'referencia',
] as const satisfies readonly Path<FormularioConfirmacion>[]

/** CloseDeliveryRequest: una entrega fallida o cancelada exige el motivo. */
export const esquemaMotivo = esquemaDeMotivo('El motivo es obligatorio.')

export type ResultadoDeLaEntrega = { entregas: Entrega[]; cobros: Pago[] }

export const prepararParaEntrega = (paqueteId: number) => api.post<Paquete>(`/api/packages/${paqueteId}/ready`)
export const registrarRetiro = (paqueteIds: number[], datos: DatosRetiro) =>
  api.post<Entrega[]>('/api/deliveries/pickup', { paqueteIds, ...datos })
export const programarDelivery = (paqueteIds: number[], datos: DatosDelivery) => api.post<Entrega[]>('/api/deliveries', { paqueteIds, ...datos })
export const salirARuta = (entregaIds: number[], responsableUsuarioId: number | null) =>
  api.post<Entrega[]>('/api/deliveries/dispatch', { entregaIds, responsableUsuarioId })
export const confirmarEntrega = (entregaIds: number[], datos: DatosConfirmacion, conCobro: boolean) =>
  api.post<ResultadoDeLaEntrega>('/api/deliveries/deliver', {
    entregaIds,
    personaRecibe: datos.personaRecibe,
    fecha: datos.fecha,
    cobro: conCobro ? { moneda: datos.moneda as Moneda, metodoPago: datos.metodoPago as MetodoDePago, referencia: datos.referencia } : null,
  })
export const marcarFallida = (entregaIds: number[], motivo: string) => api.post<Entrega[]>('/api/deliveries/fail', { entregaIds, motivo })
export const cancelarEntregas = (entregaIds: number[], motivo: string) => api.post<Entrega[]>('/api/deliveries/cancel', { entregaIds, motivo })
