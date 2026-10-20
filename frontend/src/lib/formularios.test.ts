import { describe, expect, it, vi } from 'vitest'
import { ApiError } from './errores.ts'
import { campoDeErrorDelBackend, mensajeDelEnvio } from './formularios.ts'

describe('campoDeErrorDelBackend', () => {
  it.each([
    ['Agencia.Nombre', '', 'agencia.nombre'],
    ['Agencia.CorreoContacto', '', 'agencia.correoContacto'],
    ['$.admin.correo', '', 'admin.correo'],
    ['Nombre', 'agencia.', 'agencia.nombre'],
  ])('%s (prefijo "%s") → %s', (clave, prefijo, campo) => {
    expect(campoDeErrorDelBackend(clave, prefijo)).toBe(campo)
  })
})

describe('mensajeDelEnvio', () => {
  it('pone cada error de validación del backend en su campo', () => {
    const setError = vi.fn()
    const error = new ApiError(400, { errors: { 'Admin.Correo': ['El correo del administrador no tiene un formato válido.'] } })

    expect(mensajeDelEnvio(error, setError, ['admin.correo'])).toBe('Revise los datos ingresados.')
    expect(setError).toHaveBeenCalledWith('admin.correo', {
      type: 'server',
      message: 'El correo del administrador no tiene un formato válido.',
    })
  })

  it('lo que no corresponde a ningún campo va al mensaje general', () => {
    const setError = vi.fn()
    const error = new ApiError(400, { errors: { Admin: ['Indique el primer administrador de la agencia.'] } })

    expect(mensajeDelEnvio(error, setError, ['admin.correo'])).toBe('Indique el primer administrador de la agencia.')
    expect(setError).not.toHaveBeenCalled()
  })

  it('cualquier otro error da su mensaje para el usuario', () => {
    const conflicto = new ApiError(409, { detail: 'Ya existe una agencia con ese nombre.' })

    expect(mensajeDelEnvio(conflicto, vi.fn(), [])).toBe('Ya existe una agencia con ese nombre.')
    expect(mensajeDelEnvio(new TypeError('x'), vi.fn(), [])).toBe('Ocurrió un error inesperado. Intente de nuevo.')
  })
})
