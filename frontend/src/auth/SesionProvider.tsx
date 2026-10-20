import { useEffect, useRef, useState, type ReactNode } from 'react'
import { queryClient } from '../lib/queryClient.ts'
import { supabase } from '../lib/supabase.ts'
import { SesionContext, type Sesion } from './sesion.ts'

/** Sigue la sesión de Supabase (inicio, cierre y renovación del token) y la comparte con la aplicación. */
export function SesionProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Sesion>(undefined)
  const usuarioAnterior = useRef<string | undefined>(undefined)

  useEffect(() => {
    // El primer aviso (INITIAL_SESSION) trae la sesión guardada o la del enlace de invitación.
    const { data } = supabase.auth.onAuthStateChange((_evento, nueva) => {
      // Otro usuario, o ninguno: no deben quedar en la caché datos del anterior.
      if (nueva?.user.id !== usuarioAnterior.current) queryClient.clear()
      usuarioAnterior.current = nueva?.user.id
      setSesion(nueva)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  return <SesionContext value={sesion}>{children}</SesionContext>
}
