import { describe, expect, it, vi } from 'vitest'
import enumeracionesDelBackend from '../../../backend/src/Paqueteria.Api/Entities/Enums/EnumeracionesDominio.cs?raw'
import embarquesDelBackend from '../../../backend/src/Paqueteria.Api/Services/EmbarquesService.cs?raw'
import {
  admite,
  datosDeEmbarque,
  esquemaEdicionEmbarque,
  esquemaFechaDelHecho,
  esquemaNuevoEmbarque,
  estadosDeEmbarque,
  estadosQuePermiten,
  resumenDeFechas,
  textoDePaquetes,
  type AccionDeEmbarque,
  type Embarque,
} from './embarques.ts'

// embarques.ts usa el cliente de la API; estas pruebas solo miran las reglas, los esquemas y los textos.
vi.mock('../lib/env.ts', () => ({ env: { VITE_API_URL: 'https://api.test' } }))
vi.mock('../lib/supabase.ts', () => ({ supabase: { auth: { getSession: vi.fn() } } }))

const mensajes = (resultado: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  Object.fromEntries((resultado.error?.issues ?? []).map((issue) => [issue.path.join('.'), issue.message]))

const embarque = (cambios: Partial<Embarque> = {}): Embarque => ({
  id: 1,
  codigoEmbarque: 'AIR-2026-0001',
  metodoEnvio: { codigo: 'AEREO', nombre: 'Aéreo' },
  ruta: { id: 1, nombre: 'Miami → Managua', origen: 'MIA', destino: 'MGA' },
  estado: 'ABIERTO',
  fechaSalida: null,
  fechaLlegadaEstimada: null,
  fechaLlegadaReal: null,
  observaciones: null,
  cantidadPaquetes: 0,
  creadoEn: '2026-10-10T15:00:00Z',
  actualizadoEn: '2026-10-10T15:00:00Z',
  ...cambios,
})

describe('esquemaNuevoEmbarque (CreateShipmentRequest)', () => {
  it('pide método y ruta', () => {
    expect(mensajes(esquemaNuevoEmbarque.safeParse({ metodoEnvio: '', rutaId: '', fechaLlegadaEstimada: '', observaciones: '' }))).toEqual({
      metodoEnvio: 'El método de envío es obligatorio.',
      rutaId: 'La ruta es obligatoria.',
    })
  })

  it('la ruta sale como número; la llegada estimada vacía, como null', () => {
    expect(esquemaNuevoEmbarque.parse({ metodoEnvio: 'AEREO', rutaId: '2', fechaLlegadaEstimada: '', observaciones: ' Semanal ' })).toEqual({
      metodoEnvio: 'AEREO',
      rutaId: 2,
      fechaLlegadaEstimada: null,
      observaciones: 'Semanal',
    })
  })

  it('la edición precarga la llegada estimada y las observaciones', () => {
    const datos = datosDeEmbarque(embarque({ fechaLlegadaEstimada: '2026-10-25', observaciones: null }))
    expect(datos).toEqual({ fechaLlegadaEstimada: '2026-10-25', observaciones: '' })
    expect(esquemaEdicionEmbarque.parse(datos)).toEqual({ fechaLlegadaEstimada: '2026-10-25', observaciones: '' })
  })
})

describe('esquemaFechaDelHecho (salida y llegada)', () => {
  const ahora = () => Date.parse('2026-10-20T18:00:00Z') // 12:00 en Managua
  const fecha = (esquema: ReturnType<typeof esquemaFechaDelHecho>, valor: string) => esquema.safeParse({ fecha: valor })

  it('vacía es "ahora": viaja como null', () => {
    expect(esquemaFechaDelHecho('salida', null, ahora).parse({ fecha: '' })).toEqual({ fecha: null })
  })

  it('se escribe en hora de Managua y viaja con su desfase; puede ser pasada', () => {
    expect(esquemaFechaDelHecho('salida', null, ahora).parse({ fecha: '2026-10-19T08:30' })).toEqual({
      fecha: '2026-10-19T08:30:00-06:00',
    })
  })

  it('nunca futura, con los 5 minutos de tolerancia de FechasDelNegocio', () => {
    const salida = esquemaFechaDelHecho('salida', null, ahora)
    expect(fecha(salida, '2026-10-20T12:05').success).toBe(true)
    expect(mensajes(fecha(salida, '2026-10-20T12:06'))).toEqual({ fecha: 'La fecha de salida no puede ser futura.' })
    expect(mensajes(fecha(esquemaFechaDelHecho('llegada', null, ahora), '2026-10-21T08:00'))).toEqual({
      fecha: 'La fecha de llegada no puede ser futura.',
    })
  })

  it('la llegada no puede ser anterior a la salida', () => {
    const llegada = esquemaFechaDelHecho('llegada', '2026-10-19T14:30:00Z', ahora) // 08:30 en Managua
    expect(fecha(llegada, '2026-10-19T08:30').success).toBe(true)
    const antes = mensajes(fecha(llegada, '2026-10-19T08:29'))
    expect(antes.fecha).toMatch(/^La llegada no puede ser anterior a la salida \(.*8:30.*\)\.$/)
  })
})

describe('acciones por estado', () => {
  const posibles = (cantidadPaquetes: number) =>
    Object.fromEntries(
      estadosDeEmbarque.map((estado) => [
        estado,
        (Object.keys(estadosQuePermiten) as AccionDeEmbarque[]).filter((accion) => admite({ estado, cantidadPaquetes }, accion)),
      ]),
    )

  it('con paquetes: se cierra abierto; no se cancela', () => {
    expect(posibles(3)).toEqual({
      ABIERTO: ['editar', 'asignar', 'quitar', 'cerrar'],
      CERRADO: ['editar', 'registrarSalida'],
      EN_TRANSITO: ['editar', 'registrarLlegada'],
      RECIBIDO: [],
      CANCELADO: [],
    })
  })

  it('sin paquetes: no se cierra; se cancela abierto o cerrado', () => {
    expect(posibles(0)).toEqual({
      ABIERTO: ['editar', 'asignar', 'quitar', 'cancelar'],
      CERRADO: ['editar', 'registrarSalida', 'cancelar'],
      EN_TRANSITO: ['editar', 'registrarLlegada'],
      RECIBIDO: [],
      CANCELADO: [],
    })
  })
})

describe('textos de la lista', () => {
  it('paquetes en singular y plural', () => {
    expect([0, 1, 12].map(textoDePaquetes)).toEqual(['Sin paquetes', '1 paquete', '12 paquetes'])
  })

  it('las fechas de cada etapa', () => {
    expect(resumenDeFechas(embarque({ fechaLlegadaEstimada: '2026-10-25' }))).toMatch(/^Creado el .+ · Llegada estimada: .+$/)
    expect(resumenDeFechas(embarque({ estado: 'EN_TRANSITO', fechaSalida: '2026-10-15T14:00:00Z' }))).toMatch(/^Salió el [^·]+$/)
    expect(
      resumenDeFechas(embarque({ estado: 'RECIBIDO', fechaSalida: '2026-10-15T14:00:00Z', fechaLlegadaReal: '2026-10-18T14:00:00Z', fechaLlegadaEstimada: '2026-10-17' })),
    ).toMatch(/^Salió el .+ · Llegó el [^·]+$/)
    expect(resumenDeFechas(embarque({ estado: 'CANCELADO', fechaLlegadaEstimada: '2026-10-25' }))).toMatch(/^Creado el [^·]+$/)
  })
})

// Si cambian los estados o las reglas del backend, estas pruebas avisan que hay que revisar qué ofrece la interfaz.
describe('las reglas coinciden con el backend', () => {
  const codigo = (pascal: string) => pascal.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()

  it('los mismos estados que el enum EstadoEmbarque, en el mismo orden', () => {
    const miembros = enumeracionesDelBackend.match(/public enum EstadoEmbarque\s*\{([^}]*)\}/)?.[1] ?? ''
    expect([...miembros.matchAll(/\b([A-Z]\w*)/g)].map(([, nombre]) => codigo(nombre))).toEqual([...estadosDeEmbarque])
  })

  it('cada acción en los estados de ExigirEstado en EmbarquesService.cs', () => {
    const delBackend = Object.fromEntries(
      [...embarquesDelBackend.matchAll(/ExigirEstado\(embarque, "([^"]+)",([^;]+)\);/g)].map(([, accion, estados]) => [
        accion,
        [...estados.matchAll(/EstadoEmbarque\.(\w+)/g)].map(([, estado]) => codigo(estado)),
      ]),
    )
    const accionDelBackend: Record<AccionDeEmbarque, string> = {
      editar: 'modificar',
      asignar: 'asignarle paquetes',
      quitar: 'quitarle paquetes',
      cerrar: 'cerrarlo',
      registrarSalida: 'registrar su salida',
      registrarLlegada: 'registrar su llegada',
      cancelar: 'cancelarlo',
    }
    expect(Object.keys(delBackend).sort()).toEqual(Object.values(accionDelBackend).sort())
    for (const [accion, estados] of Object.entries(estadosQuePermiten)) {
      expect(estados, accion).toEqual(delBackend[accionDelBackend[accion as AccionDeEmbarque]])
    }
  })
})
