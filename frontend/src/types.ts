export type Rol = 'ADMIN' | 'AGENTE' | 'BODEGA' | 'REPARTIDOR' | 'PLATAFORMA'
export interface Identidad {
  tipo: 'AGENCIA' | 'PLATAFORMA'
  id: number
  nombres: string
  apellidos: string
  correo: string
  roles: Rol[]
  agencia: {
    id: number
    nombre: string
    estado: 'ACTIVA' | 'SUSPENDIDA'
  } | null
}
export interface Paginado<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}
export interface Agencia {
  id: number
  nombre: string
  ruc: string | null
  correoContacto: string | null
  telefono: string | null
  estado: 'ACTIVA' | 'SUSPENDIDA'
  creadoEn: string
  actualizadoEn: string
}
export interface Usuario {
  id: number
  nombres: string
  apellidos: string
  correo: string
  telefono: string | null
  activo: boolean
  roles: Rol[]
  creadoEn: string
  actualizadoEn: string
}
export interface Ubicacion {
  id: number
  codigo: string
  nombre: string
  pais: 'US' | 'NI'
  activo: boolean
}
export interface Ruta {
  id: number
  nombre: string
  origen: Ubicacion
  destino: Ubicacion
  activo: boolean
}
export interface MetodoEnvio {
  codigo: string
  nombre: string
}
export interface Tarifa {
  id: number
  metodoEnvio: MetodoEnvio
  precioPorUnidad: number
  unidad: 'LB'
  moneda: 'USD'
  fechaInicio: string
  fechaFin: string | null
  estado: 'PROGRAMADA' | 'VIGENTE' | 'VENCIDA' | 'ANULADA'
  creadoPorUsuarioId: number | null
  creadoEn: string
}
export interface TarifaActual {
  metodoEnvio: MetodoEnvio
  tarifa: Tarifa | null
}
export interface TipoCambio {
  fecha: string
  nioPorUsd: number
  creadoPorUsuarioId: number
  actualizadoEn: string
}
export interface Catalogos {
  metodosEnvio: (MetodoEnvio & { prefijoEmbarque: string })[]
  rutas: { id: number; nombre: string; origen: string; destino: string }[]
  estadosPaquete: {
    id: number
    codigo: string
    nombre: string
    orden: number
    esFinal: boolean
  }[]
}
