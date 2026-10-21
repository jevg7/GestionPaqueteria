import { describe, expect, it, vi } from 'vitest'
import { esquemaEdicionAgencia, esquemaNuevaAgencia, nuevaAgenciaVacia } from './agencias.ts'

// agencias.ts usa el cliente de la API; estas pruebas solo miran los esquemas.
vi.mock('../lib/env.ts', () => ({ env: { VITE_API_URL: 'https://api.test' } }))
vi.mock('../lib/supabase.ts', () => ({ supabase: { auth: { getSession: vi.fn() } } }))

const mensajes = (resultado: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  Object.fromEntries((resultado.error?.issues ?? []).map((issue) => [issue.path.join('.'), issue.message]))

describe('esquemaNuevaAgencia (las reglas y mensajes de CreateAgencyRequest)', () => {
  it('pide los datos obligatorios', () => {
    expect(mensajes(esquemaNuevaAgencia.safeParse(nuevaAgenciaVacia))).toEqual({
      'agencia.nombre': 'El nombre de la agencia es obligatorio.',
      'admin.nombres': 'Los nombres del administrador son obligatorios.',
      'admin.apellidos': 'Los apellidos del administrador son obligatorios.',
      'admin.correo': 'El correo del administrador es obligatorio: ahí llega la invitación.',
    })
  })

  it('recorta los textos; los opcionales pueden quedar vacíos', () => {
    const datos = esquemaNuevaAgencia.parse({
      agencia: { nombre: '  Envíos Rápidos  ', ruc: '', correoContacto: ' ', telefono: '' },
      admin: { nombres: ' Ana ', apellidos: 'López', correo: ' ana@agencia.test ', telefono: '+505 8888-0002' },
    })

    expect(datos).toEqual({
      agencia: { nombre: 'Envíos Rápidos', ruc: '', correoContacto: '', telefono: '' },
      admin: { nombres: 'Ana', apellidos: 'López', correo: 'ana@agencia.test', telefono: '+505 8888-0002' },
    })
  })

  it('valida los formatos y los largos máximos', () => {
    const resultado = esquemaNuevaAgencia.safeParse({
      agencia: { nombre: 'x'.repeat(151), ruc: '1'.repeat(31), correoContacto: 'sin-arroba', telefono: 'abc' },
      admin: { nombres: 'Ana', apellidos: 'López', correo: 'ana@', telefono: '' },
    })

    expect(mensajes(resultado)).toEqual({
      'agencia.nombre': 'El nombre admite hasta 150 caracteres.',
      'agencia.ruc': 'El RUC admite hasta 30 caracteres.',
      'agencia.correoContacto': 'El correo de contacto no tiene un formato válido.',
      'agencia.telefono': 'El teléfono solo admite dígitos, espacios, guiones, paréntesis y un + inicial.',
      'admin.correo': 'El correo del administrador no tiene un formato válido.',
    })
  })

  it('la edición usa las mismas reglas de la agencia', () => {
    expect(mensajes(esquemaEdicionAgencia.safeParse({ agencia: { nombre: '', ruc: '', correoContacto: '', telefono: '' } }))).toEqual({
      'agencia.nombre': 'El nombre de la agencia es obligatorio.',
    })
  })
})
