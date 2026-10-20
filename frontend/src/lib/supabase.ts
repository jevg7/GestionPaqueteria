import { createClient } from '@supabase/supabase-js'
import { leerEnlaceDeAuth } from './enlaceDeAuth.ts'
import { env } from './env.ts'

// Al abrir el enlace de una invitación, Supabase deja el resultado en la URL y lo borra al procesarlo.
// Se lee antes de crear el cliente para saber si el enlace traía un error (p. ej. que expiró).
export const enlaceDeAuth = leerEnlaceDeAuth(window.location.hash, window.location.search)

// Supabase solo se usa para la autenticación. Los datos del negocio van siempre por la API
// (el esquema paqueteria no está expuesto en la Data API de Supabase).
export const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY)

/**
 * Cierra la sesión solo en este dispositivo (Supabase, por defecto, la cierra en todos): cerrar la de
 * la oficina no debe sacar al repartidor de la suya en el teléfono.
 */
export function cerrarSesion() {
  return supabase.auth.signOut({ scope: 'local' })
}
