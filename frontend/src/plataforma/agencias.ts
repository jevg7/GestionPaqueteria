import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import type { Path } from 'react-hook-form'
import { z } from 'zod'
import { api, type Pagina } from '../lib/api.ts'
import { correoObligatorio, correoOpcional, telefonoOpcional, textoObligatorio, textoOpcional } from '../lib/validacion.ts'

export type EstadoAgencia = 'ACTIVA' | 'SUSPENDIDA'

/** AgencyResponse del backend. */
export type Agencia = {
  id: number
  nombre: string
  ruc: string | null
  correoContacto: string | null
  telefono: string | null
  estado: EstadoAgencia
  creadoEn: string
  actualizadoEn: string
}

export const TAMANO_DE_PAGINA = 20

export type FiltrosAgencias = { buscar: string; estado: EstadoAgencia | ''; pagina: number }

/** Raíz de las claves de caché de las agencias: invalidarla refresca listas y detalles. */
export const claveAgencias = ['plataforma', 'agencias'] as const

export function opcionesListaAgencias({ buscar, estado, pagina }: FiltrosAgencias) {
  return queryOptions({
    queryKey: [...claveAgencias, 'lista', { buscar, estado, pagina }],
    queryFn: ({ signal }) =>
      api.get<Pagina<Agencia>>('/api/platform/agencies', {
        params: { search: buscar, estado, page: pagina, pageSize: TAMANO_DE_PAGINA },
        signal,
      }),
    // Al cambiar de página o de filtro se sigue viendo la lista anterior mientras llega la nueva.
    placeholderData: keepPreviousData,
  })
}

export function opcionesAgencia(id: number) {
  return queryOptions({
    queryKey: [...claveAgencias, 'detalle', id],
    queryFn: ({ signal }) => api.get<Agencia>(`/api/platform/agencies/${id}`, { signal }),
  })
}

// Formularios: las mismas reglas y mensajes que AgencyRequest y AgencyAdminRequest del backend.
const esquemaAgencia = z.object({
  nombre: textoObligatorio('El nombre de la agencia es obligatorio.', 150, 'El nombre admite hasta 150 caracteres.'),
  ruc: textoOpcional(30, 'El RUC admite hasta 30 caracteres.'),
  correoContacto: correoOpcional(
    'El correo de contacto admite hasta 254 caracteres.',
    'El correo de contacto no tiene un formato válido.',
  ),
  telefono: telefonoOpcional,
})

const esquemaAdmin = z.object({
  nombres: textoObligatorio('Los nombres del administrador son obligatorios.', 100, 'Los nombres admiten hasta 100 caracteres.'),
  apellidos: textoObligatorio(
    'Los apellidos del administrador son obligatorios.',
    100,
    'Los apellidos admiten hasta 100 caracteres.',
  ),
  correo: correoObligatorio(
    'El correo del administrador es obligatorio: ahí llega la invitación.',
    'El correo admite hasta 254 caracteres.',
    'El correo del administrador no tiene un formato válido.',
  ),
  telefono: telefonoOpcional,
})

export const esquemaNuevaAgencia = z.object({ agencia: esquemaAgencia, admin: esquemaAdmin })
/** La edición anida los datos en "agencia" para compartir los campos con el alta; la API los recibe en la raíz. */
export const esquemaEdicionAgencia = z.object({ agencia: esquemaAgencia })

export type DatosNuevaAgencia = z.output<typeof esquemaNuevaAgencia>
export type DatosEdicionAgencia = z.output<typeof esquemaEdicionAgencia>
export type DatosAgencia = DatosEdicionAgencia['agencia']

export const camposDeAgencia = [
  'agencia.nombre',
  'agencia.ruc',
  'agencia.correoContacto',
  'agencia.telefono',
] as const satisfies readonly Path<DatosEdicionAgencia>[]

export const camposDeNuevaAgencia = [
  ...camposDeAgencia,
  'admin.nombres',
  'admin.apellidos',
  'admin.correo',
  'admin.telefono',
] as const satisfies readonly Path<DatosNuevaAgencia>[]

export const nuevaAgenciaVacia: DatosNuevaAgencia = {
  agencia: { nombre: '', ruc: '', correoContacto: '', telefono: '' },
  admin: { nombres: '', apellidos: '', correo: '', telefono: '' },
}

export function datosDeAgencia(agencia: Agencia): DatosAgencia {
  return {
    nombre: agencia.nombre,
    ruc: agencia.ruc ?? '',
    correoContacto: agencia.correoContacto ?? '',
    telefono: agencia.telefono ?? '',
  }
}

// Los campos opcionales vacíos viajan como "": la API los guarda como null.
export const crearAgencia = (datos: DatosNuevaAgencia) => api.post<Agencia>('/api/platform/agencies', datos)
export const editarAgencia = (id: number, datos: DatosAgencia) => api.put<Agencia>(`/api/platform/agencies/${id}`, datos)
export const suspenderAgencia = (id: number) => api.post(`/api/platform/agencies/${id}/suspend`)
export const reactivarAgencia = (id: number) => api.post(`/api/platform/agencies/${id}/activate`)
