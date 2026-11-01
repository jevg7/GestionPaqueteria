interface Entorno {
  VITE_DEMO_MODE?: string
  VITE_API_URL?: string
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

function urlHttp(value: string) {
  try {
    const url = new URL(value)
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    return (
      (url.protocol === 'https:' || (local && url.protocol === 'http:')) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    )
  } catch {
    return false
  }
}

function clavePublica(key: string) {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true
  // Compatibilidad con anon heredada. Solo identifica el tipo de clave;
  // la firma y los permisos los comprueban Supabase y la API.
  try {
    const payload = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(payload)).role === 'anon'
  } catch {
    return false
  }
}

export function leerConfiguracion(env: Entorno) {
  const modoDemo = env.VITE_DEMO_MODE === 'true'
  const apiUrl = (env.VITE_API_URL?.trim() || 'https://localhost:7225').replace(
    /\/+$/,
    '',
  )
  const supabaseUrl = (env.VITE_SUPABASE_URL?.trim() || '').replace(/\/+$/, '')
  const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || ''
  const errores: string[] = []
  if (!modoDemo) {
    if (!urlHttp(apiUrl))
      errores.push(
        'VITE_API_URL debe ser una URL HTTPS (HTTP solo en localhost).',
      )
    if (!urlHttp(supabaseUrl))
      errores.push('Falta una VITE_SUPABASE_URL válida.')
    if (!clavePublica(supabaseKey))
      errores.push(
        'VITE_SUPABASE_PUBLISHABLE_KEY debe contener una clave pública publishable o anon.',
      )
  }
  return { modoDemo, apiUrl, supabaseUrl, supabaseKey, errores }
}

export const configuracion = leerConfiguracion({
  VITE_DEMO_MODE: import.meta.env.VITE_DEMO_MODE,
  VITE_API_URL: import.meta.env.VITE_API_URL,
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
})
