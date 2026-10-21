import { useQuery } from '@tanstack/react-query'
import { createContext, useContext } from 'react'
import { api } from '../lib/api.ts'
import { useSesion } from './sesion.ts'

export type RolAgencia = 'ADMIN' | 'AGENTE' | 'BODEGA' | 'REPARTIDOR'
export type Rol = RolAgencia | 'PLATAFORMA'

export const nombresDeRol: Record<Rol, string> = {
  ADMIN: 'Administrador',
  AGENTE: 'Agente',
  BODEGA: 'Bodega',
  REPARTIDOR: 'Repartidor',
  PLATAFORMA: 'Dueño de la plataforma',
}

/** GET /api/me (CurrentUserResponse): quién inició sesión según la API. */
export type Identidad = {
  tipo: 'AGENCIA' | 'PLATAFORMA'
  id: number
  nombres: string
  apellidos: string
  correo: string
  /** Solo los roles activos. */
  roles: Rol[]
  agencia: { id: number; nombre: string; estado: 'ACTIVA' | 'SUSPENDIDA' } | null
}

/**
 * Identidad del usuario de la sesión. Roles, agencia y acceso salen de la BD, no del token de
 * Supabase: si la cuenta no tiene acceso, la API responde 403 con el motivo.
 */
export function useIdentidad() {
  const usuario = useSesion()?.user.id
  return useQuery({
    queryKey: ['identidad', usuario],
    queryFn: ({ signal }) => api.get<Identidad>('/api/me', { signal }),
    enabled: usuario !== undefined,
    // La API comprueba roles y acceso en cada solicitud; aquí basta refrescarlos cada minuto.
    staleTime: 60_000,
  })
}

/** Identidad ya cargada: disponible en las rutas que protege <AccesoProtegido>. */
export const IdentidadContext = createContext<Identidad | null>(null)

export function useIdentidadActual(): Identidad {
  const identidad = useContext(IdentidadContext)
  if (!identidad) throw new Error('useIdentidadActual solo funciona dentro de <AccesoProtegido>.')
  return identidad
}

export function nombreCompleto(identidad: Identidad): string {
  return `${identidad.nombres} ${identidad.apellidos}`
}
