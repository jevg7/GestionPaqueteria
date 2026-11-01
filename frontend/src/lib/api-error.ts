export interface Problema {
  status?: number
  title?: string
  detail?: string
  traceId?: string
  errors?: Record<string, string[]>
}
export class ErrorApi extends Error {
  constructor(
    public status: number,
    public problema: Problema = {},
  ) {
    const validation = Object.values(problema.errors ?? {})
      .flat()
      .join(' ')
    const messages: Record<number, string> = {
      0: 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
      401: 'Tu sesión ha vencido. Vuelve a iniciar sesión.',
      403: 'No tienes acceso a esta operación.',
      404: 'No se encontró el registro solicitado.',
      409: 'Los datos han cambiado. Actualiza la página e inténtalo de nuevo.',
      503: 'El servicio no está disponible en este momento. Inténtalo en unos minutos.',
    }
    super(
      problema.detail ||
        validation ||
        messages[status] ||
        'No se pudo completar la operación. Inténtalo de nuevo.',
    )
    this.name = 'ErrorApi'
  }
}
export const mensajeError = (error: unknown) =>
  error instanceof Error ? error.message : 'No se pudo completar la operación.'
