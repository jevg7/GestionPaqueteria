import type { Session } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'

/** Sesión de Supabase: undefined mientras se lee la guardada, null si no hay. */
export type Sesion = Session | null | undefined

export const SesionContext = createContext<Sesion>(undefined)

export function useSesion(): Sesion {
  return useContext(SesionContext)
}
