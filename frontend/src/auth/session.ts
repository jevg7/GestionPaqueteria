import { createContext, useContext } from 'react'
import type { Identidad, Rol } from '../types'
export interface Sesion {
  usuario?: Identidad
  cargando: boolean
  autenticado: boolean
  error: unknown
  demo: boolean
  entrarDemo: (rol: Rol) => void
  salir: () => Promise<void>
  reintentar: () => void
}
export const SesionContext = createContext<Sesion | null>(null)
export function useSesion() {
  const context = useContext(SesionContext)
  if (!context) throw new Error('Falta el proveedor de sesión.')
  return context
}
