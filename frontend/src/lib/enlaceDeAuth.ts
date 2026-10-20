/** Lo que Supabase deja en la URL al volver de un enlace de correo (por ejemplo, una invitación). */
export type EnlaceDeAuth = {
  /** Tipo de enlace (invite, recovery…) cuando trae una sesión. */
  tipo?: string
  /** Código del error (p. ej. otp_expired) cuando el enlace no sirvió. */
  error?: string
}

/** Lee el fragmento (#…) y la consulta (?…) de la URL con la que se abrió la aplicación. */
export function leerEnlaceDeAuth(fragmento: string, consulta: string): EnlaceDeAuth {
  const delFragmento = new URLSearchParams(fragmento.replace(/^#/, ''))
  const deLaConsulta = new URLSearchParams(consulta)
  const leer = (nombre: string) => delFragmento.get(nombre) ?? deLaConsulta.get(nombre) ?? undefined
  return { tipo: leer('type'), error: leer('error_code') ?? leer('error') }
}
