import { queryOptions } from '@tanstack/react-query'
import { api } from '../lib/api.ts'

/** GET /api/catalogs: datos para los formularios de la agencia (solo registros activos). */
export type Catalogos = {
  metodosEnvio: { codigo: string; nombre: string; prefijoEmbarque: string }[]
  rutas: { id: number; nombre: string; origen: string; destino: string }[]
  estadosPaquete: { id: number; codigo: string; nombre: string; orden: number; esFinal: boolean }[]
}

export const opcionesCatalogos = queryOptions({
  queryKey: ['catalogos'],
  queryFn: ({ signal }) => api.get<Catalogos>('/api/catalogs', { signal }),
  // Cambian poco; quien modifique métodos, rutas o ubicaciones debe invalidar esta consulta.
  staleTime: 5 * 60_000,
})
