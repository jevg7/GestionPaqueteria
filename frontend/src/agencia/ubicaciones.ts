import { queryOptions, type QueryClient } from '@tanstack/react-query'
import type { Path } from 'react-hook-form'
import { z } from 'zod'
import { api } from '../lib/api.ts'
import { textoObligatorio } from '../lib/validacion.ts'
import { opcionesCatalogos } from './catalogos.ts'

export type Pais = 'US' | 'NI'

/** LocationResponse: una bodega en EE. UU. o una agencia en Nicaragua. */
export type Ubicacion = { id: number; codigo: string; nombre: string; pais: Pais; activo: boolean }

/** RouteResponse: siempre de una ubicación en EE. UU. a una en Nicaragua. */
export type Ruta = { id: number; nombre: string; origen: Ubicacion; destino: Ubicacion; activo: boolean }

export const nombresDePais: Record<Pais, string> = { US: 'Estados Unidos', NI: 'Nicaragua' }

export const opcionesUbicaciones = queryOptions({
  queryKey: ['agencia', 'ubicaciones'],
  queryFn: ({ signal }) => api.get<Ubicacion[]>('/api/locations', { signal }),
})

export const opcionesRutas = queryOptions({
  queryKey: ['agencia', 'rutas'],
  queryFn: ({ signal }) => api.get<Ruta[]>('/api/routes', { signal }),
})

/**
 * Tras cualquier cambio: las rutas muestran los datos de sus ubicaciones y los catálogos de los formularios
 * (p. ej. el de embarques) solo traen las rutas activas.
 */
export function refrescarConfiguracion(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: opcionesUbicaciones.queryKey }),
    queryClient.invalidateQueries({ queryKey: opcionesRutas.queryKey }),
    queryClient.invalidateQueries({ queryKey: opcionesCatalogos.queryKey }),
  ])
}

// Las reglas y mensajes de CreateLocationRequest, CreateRouteRequest y RenameRequest.
const nombre = textoObligatorio('El nombre es obligatorio.', 100, 'El nombre admite hasta 100 caracteres.')

export const esquemaNombre = z.object({ nombre })

export const esquemaNuevaUbicacion = z.object({
  codigo: z
    .string()
    .trim()
    .min(1, 'El código es obligatorio.')
    .regex(/^[A-Za-z0-9]{2,10}$/, 'El código tiene de 2 a 10 letras o dígitos, sin espacios.')
    .transform((codigo) => codigo.toUpperCase()),
  nombre,
  pais: z.enum(['US', 'NI'], { error: 'El país es obligatorio: US (Estados Unidos) o NI (Nicaragua).' }),
})

export const esquemaNuevaRuta = z.object({
  origenId: z.coerce.number<string>().int().min(1, 'El origen es obligatorio.'),
  destinoId: z.coerce.number<string>().int().min(1, 'El destino es obligatorio.'),
  nombre: textoObligatorio('El nombre es obligatorio (por ejemplo: Miami → Managua).', 100, 'El nombre admite hasta 100 caracteres.'),
})

export type FormularioNuevaUbicacion = z.input<typeof esquemaNuevaUbicacion>
export type DatosNuevaUbicacion = z.output<typeof esquemaNuevaUbicacion>
export type FormularioNuevaRuta = z.input<typeof esquemaNuevaRuta>
export type DatosNuevaRuta = z.output<typeof esquemaNuevaRuta>

export const camposDeNuevaUbicacion = ['codigo', 'nombre', 'pais'] as const satisfies readonly Path<FormularioNuevaUbicacion>[]
export const camposDeNuevaRuta = ['origenId', 'destinoId', 'nombre'] as const satisfies readonly Path<FormularioNuevaRuta>[]

export const crearUbicacion = (datos: DatosNuevaUbicacion) => api.post<Ubicacion>('/api/locations', datos)
export const renombrarUbicacion = (id: number, nuevoNombre: string) => api.put<Ubicacion>(`/api/locations/${id}`, { nombre: nuevoNombre })
export const cambiarActivoUbicacion = (id: number, activar: boolean) =>
  api.post(`/api/locations/${id}/${activar ? 'activate' : 'deactivate'}`)

export const crearRuta = (datos: DatosNuevaRuta) => api.post<Ruta>('/api/routes', datos)
export const renombrarRuta = (id: number, nuevoNombre: string) => api.put<Ruta>(`/api/routes/${id}`, { nombre: nuevoNombre })
export const cambiarActivoRuta = (id: number, activar: boolean) => api.post(`/api/routes/${id}/${activar ? 'activate' : 'deactivate'}`)
