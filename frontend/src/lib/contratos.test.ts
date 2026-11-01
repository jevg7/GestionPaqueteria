import { describe, expect, it } from 'vitest'
import { fechaManagua } from './format'
import {
  tarifaSchema,
  nuevoUsuarioSchema,
  cambioSchema,
  passwordSchema,
} from './schemas'
import { ErrorApi } from './api-error'

describe('Reglas de entrada de los formularios', () => {
  it('acepta hasta cuatro decimales y rechaza pérdida de precisión en tarifas', () => {
    const values = {
      metodoEnvio: 'AEREO',
      precioPorUnidad: '3.1234',
      fechaInicio: fechaManagua(),
    }
    expect(tarifaSchema.safeParse(values).success).toBe(true)
    expect(
      tarifaSchema.safeParse({ ...values, precioPorUnidad: '3.12345' }).success,
    ).toBe(false)
    expect(
      tarifaSchema.safeParse({ ...values, precioPorUnidad: '0' }).success,
    ).toBe(false)
    expect(
      tarifaSchema.safeParse({ ...values, precioPorUnidad: '1e3' }).success,
    ).toBe(false)
  })
  it('rechaza un usuario sin roles y recorta su correo', () => {
    const values = {
      nombres: 'Andrea',
      apellidos: 'Pérez',
      correo: ' andrea@example.com ',
      telefono: '',
      roles: ['AGENTE'],
    }
    expect(nuevoUsuarioSchema.parse(values).correo).toBe('andrea@example.com')
    expect(nuevoUsuarioSchema.safeParse({ ...values, roles: [] }).success).toBe(
      false,
    )
  })
  it('rechaza un tipo de cambio con más de cuatro decimales', () => {
    expect(
      cambioSchema.safeParse({ fecha: fechaManagua(), nioPorUsd: '36.6243' })
        .success,
    ).toBe(true)
    expect(
      cambioSchema.safeParse({ fecha: fechaManagua(), nioPorUsd: '36.62435' })
        .success,
    ).toBe(false)
  })
  it('exige que coincidan las contraseñas de la invitación', () => {
    expect(
      passwordSchema.safeParse({
        password: 'contraseña-1',
        confirmar: 'contraseña-2',
      }).success,
    ).toBe(false)
  })
})
describe('Fechas del negocio y errores', () => {
  it('usa el día de Managua cuando UTC ya pasó al siguiente día', () => {
    expect(fechaManagua(new Date('2026-10-25T02:00:00Z'))).toBe('2026-10-24')
    expect(fechaManagua(new Date('2026-10-25T06:00:00Z'))).toBe('2026-10-25')
  })
  it('prioriza el detalle de negocio y conserva los errores de validación', () => {
    expect(
      new ErrorApi(409, { detail: 'La tarifa ya se aplicó a un paquete.' })
        .message,
    ).toBe('La tarifa ya se aplicó a un paquete.')
    expect(
      new ErrorApi(400, { errors: { Nombre: ['El nombre es obligatorio.'] } })
        .message,
    ).toBe('El nombre es obligatorio.')
  })
})
