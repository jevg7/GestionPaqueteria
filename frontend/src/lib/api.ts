import { env } from './env.ts'
import { supabase } from './supabase.ts'

// Cliente de la API del backend: adjunta el token de la sesión de Supabase y convierte las respuestas
// de error (ProblemDetails) en ApiError, con un mensaje que siempre se puede mostrar al usuario.

/** Cuerpo de error de la API: ProblemDetails (RFC 9457) de ASP.NET Core. */
type ProblemDetails = {
  title?: string
  detail?: string
  traceId?: string
  /** Errores de validación por campo (400 automáticos de [ApiController]), ya en español. */
  errors?: Record<string, string[]>
}

export class ApiError extends Error {
  /** Estado HTTP; 0 si no hubo respuesta (sin conexión, la API apagada, certificado o CORS). */
  readonly status: number
  /** Mensaje de negocio que escribió el backend, si lo hay. */
  readonly detail?: string
  readonly errors?: Record<string, string[]>
  /** Identificador para buscar la solicitud en los logs de la API. */
  readonly traceId?: string

  constructor(status: number, problema: ProblemDetails = {}) {
    super(problema.detail || mensajePorEstado(status, problema.errors !== undefined))
    this.name = 'ApiError'
    this.status = status
    this.detail = problema.detail
    this.errors = problema.errors
    this.traceId = problema.traceId
  }
}

function mensajePorEstado(status: number, conErroresDeCampos: boolean): string {
  if (status === 0) return 'No se pudo conectar con el servidor. Revise su conexión e intente de nuevo.'
  if (status === 400 && conErroresDeCampos) return 'Revise los datos ingresados.'
  switch (status) {
    case 400:
      return 'La solicitud no es válida.'
    case 401:
      return 'Su sesión no es válida o expiró. Inicie sesión de nuevo.'
    case 403:
      return 'No tiene permiso para realizar esta acción.'
    case 404:
      return 'No se encontró el registro solicitado.'
    case 409:
      return 'La operación no se puede realizar en el estado actual.'
    case 503:
      return 'El servicio no está disponible. Intente de nuevo en unos minutos.'
    default:
      return 'Ocurrió un error inesperado. Intente de nuevo.'
  }
}

/** Errores que pueden desaparecer al repetir la solicitud: sin conexión o una falla del servidor. */
export function esErrorPasajero(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 0 || error.status >= 500)
}

/** Texto para mostrar al usuario a partir de cualquier error (nunca un mensaje técnico). */
export function mensajeDeError(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Ocurrió un error inesperado. Intente de nuevo.'
}

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
