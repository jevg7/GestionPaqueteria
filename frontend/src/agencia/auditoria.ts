import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import type { Tono } from '../components/Etiqueta.tsx'
import { api, type Pagina } from '../lib/api.ts'
import { instanteEnManagua } from '../lib/formato.ts'
import { claveUsuarios, type Usuario } from './usuarios.ts'

/** Las tablas que audita la BD (trigger fn_auditar en schema.sql), con su nombre en la interfaz. */
export const tablasAuditadas = {
  clientes: 'Clientes',
  paquetes: 'Paquetes',
  embarques: 'Embarques',
  facturas: 'Facturas',
  detalles_factura: 'Líneas de factura',
  pagos: 'Pagos',
  entregas: 'Entregas',
  tarifas_envio: 'Tarifas',
  tipos_cambio: 'Tipos de cambio',
  ubicaciones: 'Ubicaciones',
  rutas: 'Rutas',
  usuarios: 'Usuarios',
  usuario_roles: 'Roles de los usuarios',
  roles: 'Roles',
  metodos_envio: 'Métodos de envío',
  estados_paquete: 'Estados del paquete',
  agencias: 'Agencias',
  usuarios_plataforma: 'Dueños de la plataforma',
} as const satisfies Record<string, string>

export type TablaAuditada = keyof typeof tablasAuditadas

export const nombreDeTabla = (tabla: string) => (tabla in tablasAuditadas ? tablasAuditadas[tabla as TablaAuditada] : tabla)

export const accionesDeAuditoria = ['INSERT', 'UPDATE', 'DELETE'] as const
export type AccionDeAuditoria = (typeof accionesDeAuditoria)[number]

export const accionesVisibles: Record<AccionDeAuditoria, { nombre: string; tono: Tono }> = {
  INSERT: { nombre: 'Alta', tono: 'verde' },
  UPDATE: { nombre: 'Cambio', tono: 'azul' },
  DELETE: { nombre: 'Borrado', tono: 'rojo' },
}

/** AuditLogResponse: un cambio con quién, cuándo, desde dónde y los valores (con los nombres de columna de la BD). */
export type RegistroDeAuditoria = {
  id: number
  fecha: string
  usuarioId: number | null
  usuario: string | null
  tabla: string
  /** La clave primaria; en una clave compuesta, sus partes separadas por coma ("3,1"). */
  registroId: string
  accion: AccionDeAuditoria
  /** En un UPDATE, solo lo que cambió. */
  valoresAnteriores: Record<string, unknown> | null
  valoresNuevos: Record<string, unknown> | null
  /** "POST /api/payments/12/void"; un dueño de la plataforma aparece como "[plataforma 2] POST …". */
  origen: string | null
  traceId: string | null
}

export const TAMANO_DE_PAGINA = 20

/** Los filtros de la dirección; desde y hasta son días del calendario ("yyyy-MM-dd") en hora de Managua. */
export type FiltrosAuditoria = {
  tabla: string
  registro: string
  usuarioId: number | null
  accion: AccionDeAuditoria | ''
  desde: string
  hasta: string
  pagina: number
}

export const claveAuditoria = ['agencia', 'auditoria'] as const

/** El primer instante de un día en Managua. */
export const inicioDelDia = (dia: string) => instanteEnManagua(`${dia}T00:00`)

/** El último instante (al milisegundo) de un día en Managua: la API incluye "hasta". */
export const finDelDia = (dia: string) => new Date(Date.parse(inicioDelDia(dia)) + 86_400_000 - 1).toISOString()

export function opcionesAuditoria({ tabla, registro, usuarioId, accion, desde, hasta, pagina }: FiltrosAuditoria) {
  return queryOptions({
    queryKey: [...claveAuditoria, { tabla, registro, usuarioId, accion, desde, hasta, pagina }],
    queryFn: ({ signal }) =>
      api.get<Pagina<RegistroDeAuditoria>>('/api/audit-logs', {
        params: {
          tabla,
          registroId: registro,
          usuarioId,
          accion,
          desde: desde ? inicioDelDia(desde) : '',
          hasta: hasta ? finDelDia(hasta) : '',
          page: pagina,
          pageSize: TAMANO_DE_PAGINA,
        },
        signal,
      }),
    placeholderData: keepPreviousData,
  })
}

/** Los empleados de la agencia (activos e inactivos), para filtrar por quién hizo el cambio. */
export const opcionesUsuariosParaFiltrar = queryOptions({
  queryKey: [...claveUsuarios, 'para-filtrar'],
  queryFn: async ({ signal }) => (await api.get<Pagina<Usuario>>('/api/users', { params: { page: 1, pageSize: 100 }, signal })).items,
  staleTime: 60_000,
})

export type CambioDeCampo = { campo: string; antes: unknown; despues: unknown }

/** Los campos del registro: en un alta, sus valores; en un cambio, antes y después; en un borrado, lo que había. */
export function camposDelRegistro({ valoresAnteriores, valoresNuevos }: Pick<RegistroDeAuditoria, 'valoresAnteriores' | 'valoresNuevos'>) {
  const antes = valoresAnteriores ?? {}
  const despues = valoresNuevos ?? {}
  const campos = [...new Set([...Object.keys(antes), ...Object.keys(despues)])]
  return campos.map((campo): CambioDeCampo => ({ campo, antes: antes[campo], despues: despues[campo] }))
}

/** Un valor del JSON de la auditoría como texto; null es "vacío" (lo muestra la interfaz aparte). */
export function textoDelValor(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null
  if (typeof valor === 'boolean') return valor ? 'sí' : 'no'
  if (typeof valor === 'object') return JSON.stringify(valor)
  return String(valor)
}
