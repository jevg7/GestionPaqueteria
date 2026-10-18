import { createClient } from '@supabase/supabase-js'
import { env } from './env.ts'

// Supabase solo se usa para la autenticación. Los datos del negocio van siempre por la API
// (el esquema paqueteria no está expuesto en la Data API de Supabase).
export const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY)
