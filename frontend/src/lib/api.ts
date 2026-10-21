import { env } from './env.ts'
import { ApiError, type ProblemDetails } from './errores.ts'
import { supabase } from './supabase.ts'

// Cliente de la API del backend: adjunta el token de la sesión de Supabase y convierte las respuestas
// de error (ProblemDetails) en ApiError, con un mensaje que siempre se puede mostrar al usuario.

export { ApiError, esErrorPasajero, mensajeDeError } from './errores.ts'

/** PagedResponse<T> del backend: una página de resultados y el total. */
export type Pagina<T> = { items: T[]; page: number; pageSize: number; total: number }

type Ruta = `/${string}`
type Parametros = Record<string, string | number | boolean | null | undefined>
type Opciones = { params?: Parametros; signal?: AbortSignal }

async function solicitar<T>(metodo: 'GET' | 'POST' | 'PUT', ruta: Ruta, cuerpo: unknown, opciones: Opciones = {}): Promise<T> {
  const url = new URL(env.VITE_API_URL + ruta)
  for (const [nombre, valor] of Object.entries(opciones.params ?? {})) {
    // Los filtros vacíos no se envían: la API los toma como "sin filtro". Un false sí se envía.
    if (valor !== undefined && valor !== null && valor !== '') url.searchParams.set(nombre, String(valor))
  }

  const encabezados = new Headers({ Accept: 'application/json' })
  const { data } = await supabase.auth.getSession()
  if (data.session) encabezados.set('Authorization', `Bearer ${data.session.access_token}`)
  if (cuerpo !== undefined) encabezados.set('Content-Type', 'application/json')

  let respuesta: Response
  try {
    respuesta = await fetch(url, {
      method: metodo,
      headers: encabezados,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: opciones.signal,
    })
  } catch (error) {
    // Cancelada por quien la pidió (TanStack Query al desmontar o cambiar de filtro): no es un error de la API.
    if (opciones.signal?.aborted) throw error
    throw new ApiError(0)
  }

  if (!respuesta.ok) throw new ApiError(respuesta.status, await leerProblema(respuesta))
  if (respuesta.status === 204) return undefined as T
  return (await respuesta.json()) as T
}

async function leerProblema(respuesta: Response): Promise<ProblemDetails | undefined> {
  if (!respuesta.headers.get('Content-Type')?.includes('json')) return undefined
  try {
    return (await respuesta.json()) as ProblemDetails
  } catch {
    return undefined
  }
}

export const api = {
  get: <T>(ruta: Ruta, opciones?: Opciones) => solicitar<T>('GET', ruta, undefined, opciones),
  post: <T = void>(ruta: Ruta, cuerpo?: unknown, opciones?: Opciones) => solicitar<T>('POST', ruta, cuerpo, opciones),
  put: <T = void>(ruta: Ruta, cuerpo: unknown, opciones?: Opciones) => solicitar<T>('PUT', ruta, cuerpo, opciones),
}
