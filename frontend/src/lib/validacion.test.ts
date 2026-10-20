import { describe, expect, it } from 'vitest'
import { correoOpcional, telefonoOpcional, textoObligatorio } from './validacion.ts'

const MENSAJE_TELEFONO = 'El teléfono solo admite dígitos, espacios, guiones, paréntesis y un + inicial.'

describe('telefonoOpcional (el patrón de los DTOs del backend)', () => {
  it.each(['', '+505 8888-0002', '(505) 2222 3333', '88880002', '  505-2222  '])('acepta "%s"', (telefono) => {
    expect(telefonoOpcional.safeParse(telefono).success).toBe(true)
  })

  it.each(['abc', '+', '505+2222', '8888.0002', '++505'])('rechaza "%s"', (telefono) => {
    expect(telefonoOpcional.safeParse(telefono).error?.issues[0].message).toBe(MENSAJE_TELEFONO)
  })

  it('admite hasta 30 caracteres', () => {
    expect(telefonoOpcional.safeParse('1'.repeat(31)).error?.issues[0].message).toBe('El teléfono admite hasta 30 caracteres.')
  })
})

describe('textoObligatorio y correoOpcional', () => {
  const nombre = textoObligatorio('Falta el nombre.', 10, 'Nombre muy largo.')
  const correo = correoOpcional('Correo muy largo.', 'Correo inválido.')

  it('recorta los espacios y un texto de solo espacios cuenta como vacío', () => {
    expect(nombre.parse('  Ana  ')).toBe('Ana')
    expect(nombre.safeParse('   ').error?.issues[0].message).toBe('Falta el nombre.')
  })

  it('el correo opcional puede quedar vacío, pero si se escribe debe ser válido', () => {
    expect(correo.parse(' ')).toBe('')
    expect(correo.parse(' contacto@agencia.test ')).toBe('contacto@agencia.test')
    expect(correo.safeParse('no-es-un-correo').error?.issues[0].message).toBe('Correo inválido.')
  })
})
