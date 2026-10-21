// Errores de la API, sin dependencias: los usan el cliente (api.ts), los formularios y la interfaz.

/** Cuerpo de error de la API: ProblemDetails (RFC 9457) de ASP.NET Core. */
export type ProblemDetails = {
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
