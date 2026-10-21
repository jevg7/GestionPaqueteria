import { describe, expect, it, vi } from 'vitest'
import { clienteVacio, datosDeCliente, esquemaCliente, nombreDelCliente, type Cliente } from './clientes.ts'

// clientes.ts usa el cliente de la API; estas pruebas solo miran los esquemas.
vi.mock('../lib/env.ts', () => ({ env: { VITE_API_URL: 'https://api.test' } }))
vi.mock('../lib/supabase.ts', () => ({ supabase: { auth: { getSession: vi.fn() } } }))

const mensajes = (resultado: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  Object.fromEntries((resultado.error?.issues ?? []).map((issue) => [issue.path.join('.'), issue.message]))

describe('esquemaCliente (las reglas y mensajes de ClientRequest)', () => {
  it('pide nombres, apellidos y teléfono', () => {
    expect(mensajes(esquemaCliente.safeParse(clienteVacio))).toEqual({
      nombres: 'Los nombres son obligatorios.',
      apellidos: 'Los apellidos son obligatorios.',
      telefono: 'El teléfono es obligatorio: es el canal para notificar al cliente.',
    })
  })

  it('recorta los textos; correo y dirección pueden quedar vacíos', () => {
    const datos = esquemaCliente.parse({
      nombres: ' María José ',
      apellidos: ' Pérez ',
      telefono: ' +505 8888-0002 ',
      correo: '  ',
      direccion: '  Del parque central, 2 c. al sur\n  Casa azul  ',
    })

    expect(datos).toEqual({
      nombres: 'María José',
      apellidos: 'Pérez',
      telefono: '+505 8888-0002',
      correo: '',
      direccion: 'Del parque central, 2 c. al sur\n  Casa azul',
    })
  })

  it('valida los formatos y los largos máximos', () => {
    const resultado = esquemaCliente.safeParse({
      nombres: 'x'.repeat(101),
      apellidos: 'y'.repeat(101),
      telefono: '8888.0002',
      correo: 'maria@',
      direccion: '',
    })

    expect(mensajes(resultado)).toEqual({
      nombres: 'Los nombres admiten hasta 100 caracteres.',
      apellidos: 'Los apellidos admiten hasta 100 caracteres.',
      telefono: 'El teléfono solo admite dígitos, espacios, guiones, paréntesis y un + inicial.',
      correo: 'El correo no tiene un formato válido.',
    })
  })
})

describe('edición de un cliente', () => {
  const cliente: Cliente = {
    id: 12,
    codigoCliente: 'CLI-000012',
    nombres: 'María José',
    apellidos: 'Pérez',
    telefono: '+505 8888-0002',
    correo: null,
    direccion: null,
    activo: true,
    fechaRegistro: '2026-10-18T17:30:00Z',
    actualizadoEn: '2026-10-18T17:30:00Z',
  }

  it('precarga los datos editables: los vacíos (null) como texto vacío, sin código ni estado', () => {
    expect(datosDeCliente(cliente)).toEqual({
      nombres: 'María José',
      apellidos: 'Pérez',
      telefono: '+505 8888-0002',
      correo: '',
      direccion: '',
    })
  })

  it('el nombre completo sirve también para el cliente de un paquete', () => {
    expect(nombreDelCliente(cliente)).toBe('María José Pérez')
    expect(nombreDelCliente({ nombres: 'Ana', apellidos: 'López' })).toBe('Ana López')
  })
})
