import { AuthApiError, AuthRetryableFetchError, AuthWeakPasswordError } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { mensajeDeErrorDeAuth } from './mensajesAuth.ts'

describe('mensajeDeErrorDeAuth', () => {
  it.each([
    ['invalid_credentials', 'Correo o contraseña incorrectos.'],
    ['email_not_confirmed', 'Su correo todavía no está confirmado.'],
    ['over_request_rate_limit', 'Demasiados intentos. Espere unos minutos e intente de nuevo.'],
    ['same_password', 'La nueva contraseña debe ser distinta de la anterior.'],
    ['un_codigo_nuevo', 'No se pudo completar la operación. Intente de nuevo.'],
  ])('%s', (codigo, mensaje) => {
    expect(mensajeDeErrorDeAuth(new AuthApiError('Mensaje en inglés de Supabase', 400, codigo))).toBe(mensaje)
  })

  it('explica por qué una contraseña es débil', () => {
    const error = new AuthWeakPasswordError('Password is known to be weak', 422, ['length', 'pwned'])

    expect(mensajeDeErrorDeAuth(error)).toBe(
      'La contraseña no es segura: es demasiado corta; aparece en filtraciones de contraseñas conocidas.',
    )
  })

  it('sin conexión con Supabase', () => {
    expect(mensajeDeErrorDeAuth(new AuthRetryableFetchError('Failed to fetch', 0))).toBe(
      'No se pudo conectar con el servicio de acceso. Revise su conexión e intente de nuevo.',
    )
  })
})
