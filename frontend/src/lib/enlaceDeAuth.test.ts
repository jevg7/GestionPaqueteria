import { describe, expect, it } from 'vitest'
import { leerEnlaceDeAuth } from './enlaceDeAuth.ts'

describe('leerEnlaceDeAuth', () => {
  it('reconoce el enlace de una invitación', () => {
    const fragmento = '#access_token=abc&expires_in=3600&refresh_token=def&token_type=bearer&type=invite'

    expect(leerEnlaceDeAuth(fragmento, '')).toEqual({ tipo: 'invite', error: undefined })
  })

  it('lee el error de un enlace expirado', () => {
    const fragmento = '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'

    expect(leerEnlaceDeAuth(fragmento, '')).toEqual({ tipo: undefined, error: 'otp_expired' })
  })

  it('también lee un error que llega en la consulta', () => {
    expect(leerEnlaceDeAuth('', '?error=server_error&error_description=x')).toEqual({ tipo: undefined, error: 'server_error' })
  })

  it('una dirección normal no trae nada', () => {
    expect(leerEnlaceDeAuth('', '')).toEqual({ tipo: undefined, error: undefined })
  })
})
