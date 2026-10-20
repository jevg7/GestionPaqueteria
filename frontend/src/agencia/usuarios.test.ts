import { describe, expect, it, vi } from 'vitest'
import { datosDeUsuario, esquemaEdicionUsuario, esquemaNuevoUsuario, nuevoUsuarioVacio, type Usuario } from './usuarios.ts'

// usuarios.ts usa el cliente de la API; estas pruebas solo miran los esquemas.
vi.mock('../lib/env.ts', () => ({ env: { VITE_API_URL: 'https://api.test' } }))
vi.mock('../lib/supabase.ts', () => ({ supabase: { auth: { getSession: vi.fn() } } }))

const mensajes = (resultado: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  Object.fromEntries((resultado.error?.issues ?? []).map((issue) => [issue.path.join('.'), issue.message]))

describe('esquemaNuevoUsuario (las reglas y mensajes de CreateUserRequest)', () => {
  it('pide nombres, apellidos, correo y al menos un rol', () => {
    expect(mensajes(esquemaNuevoUsuario.safeParse(nuevoUsuarioVacio))).toEqual({
      nombres: 'Los nombres son obligatorios.',
      apellidos: 'Los apellidos son obligatorios.',
      correo: 'El correo es obligatorio: ahí llega la invitación.',
      roles: 'Indique al menos un rol.',
    })
  })

  it('acepta un empleado con varios roles y recorta los textos', () => {
    const datos = esquemaNuevoUsuario.parse({
      nombres: ' Ana ',
      apellidos: 'López',
      correo: ' ana@agencia.test ',
      telefono: '',
      roles: ['AGENTE', 'BODEGA'],
    })

    expect(datos).toEqual({ nombres: 'Ana', apellidos: 'López', correo: 'ana@agencia.test', telefono: '', roles: ['AGENTE', 'BODEGA'] })
  })
})

describe('edición de un usuario', () => {
  const usuario: Usuario = {
    id: 7,
    nombres: 'Ana',
    apellidos: 'López',
    correo: 'ana@agencia.test',
    telefono: null,
    activo: true,
    roles: ['ADMIN'],
    creadoEn: '2026-10-18T17:30:00Z',
    actualizadoEn: '2026-10-18T17:30:00Z',
  }

  it('precarga los datos editables (sin el correo, que no cambia)', () => {
    expect(datosDeUsuario(usuario)).toEqual({ nombres: 'Ana', apellidos: 'López', telefono: '', roles: ['ADMIN'] })
  })

  it('el esquema de edición no envía el correo aunque llegue', () => {
    expect(esquemaEdicionUsuario.parse({ ...datosDeUsuario(usuario), correo: 'otro@agencia.test' })).not.toHaveProperty('correo')
  })
})
