import { supabase, modoDemo } from './supabase'
import { ErrorApi, type Problema } from './api-error'
import { configuracion } from './config'

function sesionVencida() {
  window.dispatchEvent(new Event('paqueteo:sesion-vencida'))
  return new ErrorApi(401)
}
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  if (modoDemo) {
    const { demoRequest } = await import('../demo/api')
    return demoRequest<T>(path, options)
  }
  if (!supabase)
    throw new ErrorApi(503, {
      detail: 'El acceso todavía no está configurado. Contacta al administrador de la plataforma.',
    })
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) throw sesionVencida()
  let response: Response
  try {
    response = await fetch(`${configuracion.apiUrl}${path}`, {
      method: options.method ?? 'GET',
      signal: options.signal,
      headers: {
        Accept: 'application/json, application/problem+json',
        Authorization: `Bearer ${data.session.access_token}`,
        ...(options.body !== undefined
          ? { 'Content-Type': 'application/json' }
          : {}),
      },
      body:
        options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      error.name === 'AbortError'
    )
      throw error
    throw new ErrorApi(0)
  }
  if (!response.ok) {
    const problem: Problema = await response.json().catch(() => ({}))
    if (response.status === 401) throw sesionVencida()
    // Una revocación de acceso debe volver a consultar /me, incluso con un JWT vigente.
    if (response.status === 403 && path !== '/api/me')
      window.dispatchEvent(new Event('paqueteo:revalidar-acceso'))
    throw new ErrorApi(response.status, problem)
  }
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>)
}
export function consulta(
  path: string,
  params: Record<string, string | number | boolean | undefined>,
) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value !== undefined) query.set(key, String(value))
  })
  return `${path}?${query}`
}
