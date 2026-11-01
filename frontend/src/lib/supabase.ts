import { createClient } from '@supabase/supabase-js'
import { configuracion } from './config'

export const modoDemo = configuracion.modoDemo
// Solo una clave pública. La clave de servicio pertenece exclusivamente a la API.
export const supabase =
  !modoDemo && configuracion.errores.length === 0
    ? createClient(configuracion.supabaseUrl, configuracion.supabaseKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null
