import type { Identidad, Rol } from '../types'
export const permisos = {
  usuarios: ['ADMIN'],
  tarifas: ['ADMIN', 'AGENTE', 'BODEGA'],
  cambio: ['ADMIN', 'AGENTE'],
  configuracion: ['ADMIN'],
  contabilidad: ['ADMIN'],
  plataforma: ['PLATAFORMA'],
} satisfies Record<string, Rol[]>
export function puede(usuario: Identidad | undefined, roles: readonly Rol[]) {
  return !!usuario?.roles.some((rol) => roles.includes(rol))
}
