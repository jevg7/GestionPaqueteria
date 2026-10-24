import { describe, expect, it, vi } from 'vitest'
import enumeracionesDelBackend from '../../../backend/src/Paqueteria.Api/Entities/Enums/EnumeracionesDominio.cs?raw'
import entregasDelBackend from '../../../backend/src/Paqueteria.Api/Services/EntregasService.cs?raw'
import {
  agruparEnVisitas,
  cobroDeLaVisita,
  cobroEnCordobas,
  esquemaConfirmacion,
  esquemaDelivery,
  esquemaMotivo,
  esquemaRetiro,
  esSoloRepartidor,
  estadoQuePermite,
  estadosDeEntrega,
  tiposDeEntrega,
  type Entrega,
} from './entregas.ts'

// entregas.ts usa el cliente de la API; estas pruebas solo miran las reglas y los esquemas.
vi.mock('../lib/env.ts', () => ({ env: { VITE_API_URL: 'https://api.test' } }))
vi.mock('../lib/supabase.ts', () => ({ supabase: { auth: { getSession: vi.fn() } } }))

const mensajes = (resultado: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  Object.fromEntries((resultado.error?.issues ?? []).map((issue) => [issue.path.join('.'), issue.message]))

const maria = { id: 1, codigoCliente: 'CLI-000001', nombres: 'María José', apellidos: 'Pérez', telefono: '+505 8888-0002' }
const juan = { id: 2, codigoCliente: 'CLI-000002', nombres: 'Juan', apellidos: 'Aguilar', telefono: '2222 3333' }

let siguiente = 1
const entrega = (cambios: Partial<Entrega> = {}): Entrega => ({
  id: siguiente++,
  paquete: { id: siguiente, codigoPaquete: `PKG-00000${siguiente}`, descripcion: 'Zapatos', estado: { id: 8, codigo: 'LISTO_PARA_ENTREGA', nombre: 'Listo para entrega' } },
  cliente: maria,
  tipoEntrega: 'DELIVERY',
  estado: 'PENDIENTE',
  direccion: 'Barrio Altamira, casa 12',
  fechaProgramada: null,
  fechaEntrega: null,
  personaRecibe: null,
  responsable: { id: 20, nombre: 'Pedro Gómez' },
  observaciones: null,
  cobroPendiente: null,
  creadoPorUsuarioId: 8,
  creadoEn: '2026-10-20T15:00:00Z',
  actualizadoEn: '2026-10-20T15:00:00Z',
  ...cambios,
})

describe('quién opera solo sus entregas', () => {
  it('el repartidor que además es agente o administrador opera en nombre de todos', () => {
    expect(esSoloRepartidor(['REPARTIDOR'])).toBe(true)
    expect(esSoloRepartidor(['REPARTIDOR', 'BODEGA'])).toBe(true)
    expect(esSoloRepartidor(['REPARTIDOR', 'AGENTE'])).toBe(false)
    expect(esSoloRepartidor(['ADMIN'])).toBe(false)
  })

  it('la misma regla que SoloRepartidor en EntregasService.cs', () => {
    expect(entregasDelBackend).toMatch(
      /SoloRepartidor =>\s*usuarioActual\.Roles\.Contains\(CodigosRol\.Repartidor\)\s*&& !usuarioActual\.Roles\.Contains\(CodigosRol\.Admin\)\s*&& !usuarioActual\.Roles\.Contains\(CodigosRol\.Agente\);/,
    )
  })
})

describe('visitas y cobro contra entrega', () => {
  it('una visita junta las entregas del mismo cliente, estado, dirección y repartidor', () => {
    const entregas = [
      entrega(),
      entrega(),
      entrega({ cliente: juan }),
      entrega({ estado: 'EN_RUTA' }),
      entrega({ responsable: null }),
      entrega({ direccion: 'Otra dirección' }),
    ]
    expect(agruparEnVisitas(entregas).map((visita) => visita.entregas.length)).toEqual([2, 1, 1, 1, 1])
  })

  it('cada factura se cobra una vez aunque la compartan varios paquetes', () => {
    const fac3 = { facturaId: 3, numeroFactura: 'FAC-000003', saldoUsd: 15.75 }
    const fac4 = { facturaId: 4, numeroFactura: 'FAC-000004', saldoUsd: 7.88 }
    const cobro = cobroDeLaVisita([entrega({ cobroPendiente: fac3 }), entrega({ cobroPendiente: fac3 }), entrega({ cobroPendiente: fac4 }), entrega()])
    expect(cobro).toEqual({ facturas: [fac3, fac4], totalUsd: 23.63 })
    // En córdobas, cada factura a su equivalente exacto: 576.83 + 288.60.
    expect(cobroEnCordobas(cobro.facturas, 36.6243)).toBe(865.43)
  })
})

describe('esquemas (PickupRequest, ScheduleDeliveryRequest, DeliverRequest, CloseDeliveryRequest)', () => {
  it('el retiro pide quién recibe; la fecha vacía es ahora', () => {
    expect(mensajes(esquemaRetiro.safeParse({ personaRecibe: ' ', fecha: '', observaciones: '' }))).toEqual({ personaRecibe: 'Indique quién recibe.' })
    expect(esquemaRetiro.parse({ personaRecibe: ' Ana López ', fecha: '', observaciones: ' Con cédula ' })).toEqual({
      personaRecibe: 'Ana López',
      fecha: null,
      observaciones: 'Con cédula',
    })
    expect(mensajes(esquemaRetiro.safeParse({ personaRecibe: 'x'.repeat(151), fecha: '', observaciones: '' }))).toEqual({
      personaRecibe: 'El nombre de quien recibe admite hasta 150 caracteres.',
    })
  })

  it('el delivery pide la dirección; repartidor y fecha programada son opcionales', () => {
    expect(mensajes(esquemaDelivery.safeParse({ direccion: '', fechaProgramada: '', responsableUsuarioId: '', observaciones: '' }))).toEqual({
      direccion: 'Indique la dirección de entrega.',
    })
    expect(esquemaDelivery.parse({ direccion: ' Casa 12 ', fechaProgramada: '2026-10-21T14:00', responsableUsuarioId: '20', observaciones: '' })).toEqual({
      direccion: 'Casa 12',
      fechaProgramada: '2026-10-21T14:00:00-06:00',
      responsableUsuarioId: 20,
      observaciones: '',
    })
    expect(esquemaDelivery.parse({ direccion: 'Casa 12', fechaProgramada: '', responsableUsuarioId: '', observaciones: '' })).toMatchObject({
      fechaProgramada: null,
      responsableUsuarioId: null,
    })
  })

  it('confirmar exige el método de pago solo si hay que cobrar; la fecha nunca futura', () => {
    const ahora = () => Date.parse('2026-10-20T18:00:00Z')
    const datos = { personaRecibe: 'María José Pérez', fecha: '', moneda: 'USD', metodoPago: '', referencia: '' }
    expect(esquemaConfirmacion(false, ahora).safeParse(datos).success).toBe(true)
    expect(mensajes(esquemaConfirmacion(true, ahora).safeParse(datos))).toEqual({ metodoPago: 'Elija el método de pago.' })
    expect(mensajes(esquemaConfirmacion(false, ahora).safeParse({ ...datos, fecha: '2026-10-20T13:00' }))).toEqual({
      fecha: 'La fecha de entrega no puede ser futura.',
    })
  })

  it('fallida o cancelada: el motivo es obligatorio', () => {
    expect(mensajes(esquemaMotivo.safeParse({ motivo: ' ' }))).toEqual({ motivo: 'El motivo es obligatorio.' })
  })
})

// Si cambian los estados, los tipos o las reglas del backend, estas pruebas avisan que hay que revisar la interfaz.
describe('las reglas coinciden con el backend', () => {
  const codigo = (pascal: string) => pascal.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()
  const miembros = (nombre: string) => {
    const cuerpo = enumeracionesDelBackend.match(new RegExp(`public enum ${nombre}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
    return [...cuerpo.matchAll(/\b([A-Z]\w*)/g)].map(([, miembro]) => codigo(miembro))
  }

  it('EstadoEntrega y TipoEntrega', () => {
    expect(miembros('EstadoEntrega')).toEqual([...estadosDeEntrega])
    expect(miembros('TipoEntrega')).toEqual([...tiposDeEntrega])
  })

  it('cada acción en el estado de ExigirEstado en EntregasService.cs', () => {
    const delBackend = Object.fromEntries(
      [...entregasDelBackend.matchAll(/ExigirEstado\(entrega, EstadoEntrega\.(\w+), "([^"]+)"\)/g)].map(([, estado, accion]) => [accion, codigo(estado)]),
    )
    expect(delBackend).toEqual({
      'salir a ruta': estadoQuePermite.salirARuta,
      'confirmarla como entregada': estadoQuePermite.confirmar,
      'marcarla como fallida': estadoQuePermite.marcarFallida,
      cancelarla: estadoQuePermite.cancelar,
    })
  })
})
