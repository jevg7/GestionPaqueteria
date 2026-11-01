// Simulador local, cargado únicamente cuando VITE_DEMO_MODE=true. No envía solicitudes.
import type {
  Agencia,
  Usuario,
  Ubicacion,
  Ruta,
  Tarifa,
  TipoCambio,
  Rol,
  Identidad,
} from '../types'
import { fechaManagua } from '../lib/format'
import { ErrorApi } from '../lib/api-error'
import { contabilidadDemo } from './contabilidad'

const ahora = new Date().toISOString()
const dia = (offset: number) =>
  fechaManagua(new Date(Date.now() + offset * 86400000))
const metodos = [
  { codigo: 'AEREO', nombre: 'Aéreo', prefijoEmbarque: 'AIR' },
  { codigo: 'MARITIMO', nombre: 'Marítimo', prefijoEmbarque: 'SEA' },
]
export function identidadDemo(rol: Rol): Identidad {
  return {
    tipo: rol === 'PLATAFORMA' ? 'PLATAFORMA' : 'AGENCIA',
    id: 1,
    nombres: 'Ana',
    apellidos: 'Martínez',
    correo: 'ana@example.com',
    roles: [rol],
    agencia:
      rol === 'PLATAFORMA'
        ? null
        : { id: 1, nombre: 'Envíos del Pacífico', estado: 'ACTIVA' },
  }
}
const usuarios: Usuario[] = [
  ['Ana', 'Martínez', 'ana@example.com', 'ADMIN', true],
  ['Carlos', 'Mendoza', 'carlos@example.com', 'AGENTE', true],
  ['Valeria', 'López', 'valeria@example.com', 'AGENTE', true],
  ['Diego', 'Ramírez', 'diego@example.com', 'BODEGA', true],
  ['Sofía', 'Castillo', 'sofia@example.com', 'BODEGA', true],
  ['José', 'García', 'jose@example.com', 'REPARTIDOR', true],
  ['Lucía', 'Hernández', 'lucia@example.com', 'AGENTE', false],
].map(([nombres, apellidos, correo, rol, activo], index) => ({
  id: index + 1,
  nombres: String(nombres),
  apellidos: String(apellidos),
  correo: String(correo),
  telefono: '+505 8888 0000',
  roles: [rol as Rol],
  activo: Boolean(activo),
  creadoEn: ahora,
  actualizadoEn: ahora,
}))
const ubicaciones: Ubicacion[] = [
  { id: 1, codigo: 'MIA', nombre: 'Bodega Miami', pais: 'US', activo: true },
  { id: 2, codigo: 'MGA', nombre: 'Agencia Managua', pais: 'NI', activo: true },
  { id: 3, codigo: 'LEO', nombre: 'Agencia León', pais: 'NI', activo: true },
  { id: 4, codigo: 'MAS', nombre: 'Agencia Masaya', pais: 'NI', activo: false },
]
const rutas: Ruta[] = [
  {
    id: 1,
    nombre: 'Miami → Managua',
    origen: ubicaciones[0],
    destino: ubicaciones[1],
    activo: true,
  },
  {
    id: 2,
    nombre: 'Miami → León',
    origen: ubicaciones[0],
    destino: ubicaciones[2],
    activo: true,
  },
]
const tarifas: Tarifa[] = [
  {
    id: 1,
    metodoEnvio: metodos[0],
    precioPorUnidad: 3.5,
    unidad: 'LB',
    moneda: 'USD',
    fechaInicio: dia(-30),
    fechaFin: null,
    estado: 'VIGENTE',
    creadoPorUsuarioId: 1,
    creadoEn: ahora,
  },
  {
    id: 2,
    metodoEnvio: metodos[1],
    precioPorUnidad: 1.75,
    unidad: 'LB',
    moneda: 'USD',
    fechaInicio: dia(-30),
    fechaFin: null,
    estado: 'VIGENTE',
    creadoPorUsuarioId: 1,
    creadoEn: ahora,
  },
  {
    id: 3,
    metodoEnvio: metodos[0],
    precioPorUnidad: 3.25,
    unidad: 'LB',
    moneda: 'USD',
    fechaInicio: dia(-90),
    fechaFin: dia(-31),
    estado: 'VENCIDA',
    creadoPorUsuarioId: 1,
    creadoEn: ahora,
  },
]
const cambios: TipoCambio[] = [0, -1, -2, -3, -4].map((offset) => ({
  fecha: dia(offset),
  nioPorUsd: 36.6243,
  creadoPorUsuarioId: 1,
  actualizadoEn: ahora,
}))
const agencias: Agencia[] = [
  'Envíos del Pacífico',
  'Nica Express',
  'Conexión Cargo',
  'Puente Logístico',
].map((nombre, index) => ({
  id: index + 1,
  nombre,
  ruc: null,
  correoContacto: `agencia${index + 1}@example.com`,
  telefono: '+505 2222 0000',
  estado: index === 3 ? 'SUSPENDIDA' : 'ACTIVA',
  creadoEn: ahora,
  actualizadoEn: ahora,
}))
type Datos = Record<string, unknown>
const invalid = (message: string) => {
  throw new ErrorApi(409, { detail: message })
}

export async function demoRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal },
): Promise<T> {
  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const url = new URL(path, 'http://demo.local')
  if (url.pathname.startsWith('/api/accounting/')) {
    if (sessionStorage.getItem('paqueteo:demo-rol') !== 'ADMIN')
      throw new ErrorApi(403)
    return contabilidadDemo<T>(url, options.method ?? 'GET', options.body)
  }
  const parts = url.pathname.split('/').filter(Boolean)
  const platform = parts[1] === 'platform'
  const recurso = platform ? parts[2] : parts[1]
  const id = Number(parts[platform ? 3 : 2])
  const accion = parts[platform ? 4 : 3]
  const method = options.method ?? 'GET'
  const body = (options.body ?? {}) as Datos
  const rol = (sessionStorage.getItem('paqueteo:demo-rol') ?? 'ADMIN') as Rol
  const permitido =
    recurso === 'me' ||
    (recurso === 'catalogs' && rol !== 'PLATAFORMA') ||
    (recurso === 'agencies' && rol === 'PLATAFORMA') ||
    (['users', 'locations', 'routes'].includes(recurso) && rol === 'ADMIN') ||
    (recurso === 'rates' &&
      (rol === 'ADMIN' ||
        (method === 'GET' && ['AGENTE', 'BODEGA'].includes(rol)))) ||
    (recurso === 'exchange-rates' &&
      (rol === 'ADMIN' || (method === 'GET' && rol === 'AGENTE')))
  if (!permitido) throw new ErrorApi(403)
  const paginate = (rows: unknown[]) => {
    const page = Number(url.searchParams.get('page') ?? 1)
    const pageSize = Number(url.searchParams.get('pageSize') ?? 10)
    return {
      items: rows.slice((page - 1) * pageSize, page * pageSize),
      total: rows.length,
      page,
      pageSize,
    }
  }
  const filter = <R>(rows: R[]) =>
    rows.filter((row) => {
      const r = row as Datos
      const search = (url.searchParams.get('search') ?? '').toLocaleLowerCase(
        'es',
      )
      return (
        (!search ||
          [r.nombre, r.nombres, r.apellidos, r.correo, r.correoContacto, r.ruc]
            .join(' ')
            .toLocaleLowerCase('es')
            .includes(search)) &&
        (!url.searchParams.has('activo') ||
          r.activo === (url.searchParams.get('activo') === 'true')) &&
        (!url.searchParams.get('estado') ||
          r.estado === url.searchParams.get('estado')) &&
        (!url.searchParams.get('rol') ||
          (r.roles as string[] | undefined)?.includes(
            url.searchParams.get('rol')!,
          ))
      )
    })
  let result: unknown
  if (recurso === 'me') result = identidadDemo(rol)
  else if (recurso === 'catalogs')
    result = {
      metodosEnvio: metodos,
      rutas: rutas
        .filter((r) => r.activo)
        .map((r) => ({
          id: r.id,
          nombre: r.nombre,
          origen: r.origen.codigo,
          destino: r.destino.codigo,
        })),
      estadosPaquete: [],
    }
  else if (recurso === 'users' && parts[2] === 'roles')
    result = ['ADMIN', 'AGENTE', 'BODEGA', 'REPARTIDOR'].map((codigo) => ({
      codigo,
      nombre: codigo,
      descripcion: null,
    }))
  else if (recurso === 'rates' && method === 'GET') {
    result =
      parts[2] === 'current'
        ? metodos.map((metodoEnvio) => ({
            metodoEnvio,
            tarifa:
              tarifas.find(
                (t) =>
                  t.metodoEnvio.codigo === metodoEnvio.codigo &&
                  t.estado === 'VIGENTE',
              ) ?? null,
          }))
        : tarifas
            .filter(
              (t) =>
                (!url.searchParams.get('metodoEnvio') ||
                  t.metodoEnvio.codigo ===
                    url.searchParams.get('metodoEnvio')) &&
                (url.searchParams.get('incluirAnuladas') === 'true' ||
                  t.estado !== 'ANULADA'),
            )
            .sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio))
  } else if (recurso === 'rates' && method === 'POST' && !id) {
    const metodo = metodos.find((m) => m.codigo === body.metodoEnvio)
    if (!metodo) throw new ErrorApi(400)
    const inicio = String(body.fechaInicio || dia(0))
    if (inicio < dia(0))
      throw new ErrorApi(400, {
        detail: 'La fecha no puede estar en el pasado.',
      })
    if (
      tarifas.some(
        (t) =>
          t.metodoEnvio.codigo === metodo.codigo &&
          t.estado !== 'ANULADA' &&
          t.fechaInicio >= inicio,
      )
    )
      invalid(
        'Ya existe una tarifa que empieza en o después de esa fecha. Anúlala primero.',
      )
    const anterior = tarifas.find(
      (t) => t.metodoEnvio.codigo === metodo.codigo && t.estado === 'VIGENTE',
    )
    if (anterior) {
      anterior.fechaFin = new Date(
        new Date(`${inicio}T12:00:00Z`).getTime() - 86400000,
      )
        .toISOString()
        .slice(0, 10)
      if (inicio === dia(0)) anterior.estado = 'VENCIDA'
    }
    const nueva: Tarifa = {
      id: Math.max(0, ...tarifas.map((t) => t.id)) + 1,
      metodoEnvio: metodo,
      precioPorUnidad: Number(body.precioPorUnidad),
      unidad: 'LB',
      moneda: 'USD',
      fechaInicio: inicio,
      fechaFin: null,
      estado: inicio > dia(0) ? 'PROGRAMADA' : 'VIGENTE',
      creadoPorUsuarioId: 1,
      creadoEn: ahora,
    }
    tarifas.push(nueva)
    result = nueva
  } else if (recurso === 'rates' && accion === 'void') {
    const tarifa = tarifas.find((t) => t.id === id)
    if (!tarifa) throw new ErrorApi(404)
    if (!['PROGRAMADA', 'VIGENTE'].includes(tarifa.estado))
      invalid(
        'Solo se pueden anular tarifas programadas o vigentes sin paquetes.',
      )
    tarifa.estado = 'ANULADA'
    const anterior = tarifas
      .filter(
        (t) =>
          t.metodoEnvio.codigo === tarifa.metodoEnvio.codigo &&
          t.estado !== 'ANULADA' &&
          t.fechaInicio < tarifa.fechaInicio,
      )
      .sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio))[0]
    if (anterior) {
      anterior.fechaFin = null
      anterior.estado =
        anterior.fechaInicio <= dia(0) ? 'VIGENTE' : 'PROGRAMADA'
    }
  } else if (recurso === 'exchange-rates') {
    if (method === 'GET') {
      result =
        parts[2] === 'current'
          ? cambios
              .filter((c) => c.fecha <= dia(0))
              .sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
          : [...cambios]
              .sort((a, b) => b.fecha.localeCompare(a.fecha))
              .slice(0, 60)
      if (!result) throw new ErrorApi(404)
    } else {
      const fecha = parts[2]
      const cambio = {
        fecha,
        nioPorUsd: Number(body.nioPorUsd),
        creadoPorUsuarioId: 1,
        actualizadoEn: ahora,
      }
      const index = cambios.findIndex((c) => c.fecha === fecha)
      if (index >= 0) cambios[index] = cambio
      else cambios.push(cambio)
      result = cambio
    }
  } else {
    const rows = (
      {
        users: usuarios,
        agencies: agencias,
        locations: ubicaciones,
        routes: rutas,
      } as Record<string, unknown[]>
    )[recurso]
    if (!rows) throw new ErrorApi(404)
    const registro = rows.find((r) => (r as Datos).id === id) as
      Datos | undefined
    if (id && !registro) throw new ErrorApi(404)
    if (method === 'GET')
      result = id
        ? registro
        : ['users', 'agencies'].includes(recurso)
          ? paginate(filter(rows))
          : rows
    else if (method === 'PUT' && registro) {
      if (
        recurso === 'users' &&
        id === 1 &&
        !(body.roles as Rol[]).includes('ADMIN')
      )
        invalid('No puedes quitarte tu propio rol de administrador.')
      Object.assign(registro, body, { actualizadoEn: ahora })
      result = registro
    } else if (accion && registro) {
      if (accion === 'resend-invite') result = undefined
      else if (recurso === 'agencies')
        registro.estado = accion === 'suspend' ? 'SUSPENDIDA' : 'ACTIVA'
      else {
        if (recurso === 'users' && id === 1 && accion === 'deactivate')
          invalid('No puedes desactivar tu propio usuario.')
        if (
          recurso === 'locations' &&
          accion === 'deactivate' &&
          rutas.some(
            (r) => r.activo && (r.origen.id === id || r.destino.id === id),
          )
        )
          invalid(
            'Esta ubicación está en una ruta activa. Desactiva primero la ruta.',
          )
        if (
          recurso === 'routes' &&
          accion === 'activate' &&
          (!(registro.origen as Ubicacion).activo ||
            !(registro.destino as Ubicacion).activo)
        )
          invalid('Las ubicaciones de la ruta deben estar activas.')
        registro.activo = accion === 'activate'
      }
    } else if (method === 'POST') {
      const nuevoId =
        Math.max(0, ...rows.map((r) => Number((r as Datos).id))) + 1
      const nuevo: Datos = {
        ...body,
        id: nuevoId,
        activo: true,
        creadoEn: ahora,
        actualizadoEn: ahora,
      }
      if (
        recurso === 'users' &&
        usuarios.some(
          (u) => u.correo.toLowerCase() === String(body.correo).toLowerCase(),
        )
      )
        invalid('El correo ya está registrado.')
      if (recurso === 'agencies') {
        Object.assign(nuevo, body.agencia, { estado: 'ACTIVA' })
        delete nuevo.agencia
        delete nuevo.admin
        if (
          agencias.some(
            (a) =>
              a.nombre.toLowerCase() === String(nuevo.nombre).toLowerCase(),
          )
        )
          invalid('Ya existe una agencia con ese nombre.')
      }
      if (recurso === 'locations') {
        nuevo.codigo = String(body.codigo).toUpperCase()
        if (ubicaciones.some((u) => u.codigo === nuevo.codigo))
          invalid('Ya existe una ubicación con ese código.')
      }
      if (recurso === 'routes') {
        const origen = ubicaciones.find((u) => u.id === Number(body.origenId))
        const destino = ubicaciones.find((u) => u.id === Number(body.destinoId))
        if (
          !origen ||
          !destino ||
          !origen.activo ||
          !destino.activo ||
          origen.pais !== 'US' ||
          destino.pais !== 'NI'
        )
          invalid(
            'Selecciona ubicaciones activas de Estados Unidos a Nicaragua.',
          )
        if (
          rutas.some(
            (r) => r.origen.id === origen!.id && r.destino.id === destino!.id,
          )
        )
          invalid('Ya existe una ruta con ese origen y destino.')
        Object.assign(nuevo, { origen, destino })
        delete nuevo.origenId
        delete nuevo.destinoId
      }
      rows.push(nuevo)
      result = nuevo
    } else throw new ErrorApi(400)
  }
  // Una respuesta HTTP real no comparte referencias con el estado de la aplicación.
  return structuredClone(result) as T
}
