import { isAuthRetryableFetchError, isAuthWeakPasswordError, type AuthError } from '@supabase/supabase-js'

const motivosDeDebilidad: Record<string, string> = {
  length: 'es demasiado corta',
  characters: 'le faltan tipos de caracteres (mayúsculas, minúsculas, números o símbolos)',
  pwned: 'aparece en filtraciones de contraseñas conocidas',
}

/** Mensaje en español para un error de Supabase Auth al iniciar sesión o al guardar la contraseña. */
export function mensajeDeErrorDeAuth(error: AuthError): string {
  if (isAuthRetryableFetchError(error)) {
    return 'No se pudo conectar con el servicio de acceso. Revise su conexión e intente de nuevo.'
  }
  if (isAuthWeakPasswordError(error)) {
    const motivos = error.reasons.map((motivo) => motivosDeDebilidad[motivo]).filter(Boolean)
    return motivos.length > 0 ? `La contraseña no es segura: ${motivos.join('; ')}.` : 'La contraseña no es segura. Elija otra.'
  }
  switch (error.code) {
    case 'invalid_credentials':
      return 'Correo o contraseña incorrectos.'
    case 'email_not_confirmed':
      return 'Su correo todavía no está confirmado.'
    case 'user_banned':
      return 'Su cuenta está bloqueada. Contacte al soporte de la plataforma.'
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Demasiados intentos. Espere unos minutos e intente de nuevo.'
    case 'same_password':
      return 'La nueva contraseña debe ser distinta de la anterior.'
    case 'session_not_found':
    case 'reauthentication_needed':
      return 'Su sesión expiró. Vuelva a abrir el enlace o inicie sesión de nuevo.'
    default:
      return 'No se pudo completar la operación. Intente de nuevo.'
  }
}
