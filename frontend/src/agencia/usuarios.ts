import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import type { Path } from 'react-hook-form'
import { z } from 'zod'
import type { RolAgencia } from '../auth/identidad.ts'
import { api, type Pagina } from '../lib/api.ts'
import { correoObligatorio, telefonoOpcional, textoObligatorio } from '../lib/validacion.ts'

/** UserResponse del backend: un empleado de la agencia. */
export type Usuario = {
  id: number
  nombres: string
  apellidos: string
  correo: string
  telefono: string | null
  activo: boolean
  roles: RolAgencia[]
  creadoEn: string
  actualizadoEn: string
}

/** RoleResponse: un rol que el ADMIN puede asignar, con su descripción. */
export type RolAsignable = { codigo: RolAgencia; nombre: string; descripcion: string | null }

export const TAMANO_DE_PAGINA = 20

export type FiltrosUsuarios = { buscar: string; activo: '' | 'true' | 'false'; rol: RolAgencia | ''; pagina: number }

/** Raíz de las claves de caché de los usuarios: invalidarla refresca listas y detalles. */
export const claveUsuarios = ['agencia', 'usuarios'] as const

export function opcionesListaUsuarios({ buscar, activo, rol, pagina }: FiltrosUsuarios) {
  return queryOptions({
    queryKey: [...claveUsuarios, 'lista', { buscar, activo, rol, pagina }],
    queryFn: ({ signal }) =>
      api.get<Pagina<Usuario>>('/api/users', {
        params: { search: buscar, activo, rol, page: pagina, pageSize: TAMANO_DE_PAGINA },
        signal,
      }),
    placeholderData: keepPreviousData,
  })
}

export function opcionesUsuario(id: number) {
  return queryOptions({
    queryKey: [...claveUsuarios, 'detalle', id],
    queryFn: ({ signal }) => api.get<Usuario>(`/api/users/${id}`, { signal }),
  })
}

export const opcionesRolesAsignables = queryOptions({
  queryKey: [...claveUsuarios, 'roles'],
  queryFn: ({ signal }) => api.get<RolAsignable[]>('/api/users/roles', { signal }),
  // Catálogo de la plataforma: no cambia mientras se usa la aplicación.
  staleTime: Infinity,
})

// Las mismas reglas y mensajes que CreateUserRequest y UpdateUserRequest del backend.
const datosDelEmpleado = {
  nombres: textoObligatorio('Los nombres son obligatorios.', 100, 'Los nombres admiten hasta 100 caracteres.'),
  apellidos: textoObligatorio('Los apellidos son obligatorios.', 100, 'Los apellidos admiten hasta 100 caracteres.'),
  telefono: telefonoOpcional,
  roles: z.array(z.string()).min(1, 'Indique al menos un rol.'),
}

export const esquemaEdicionUsuario = z.object(datosDelEmpleado)
export const esquemaNuevoUsuario = z.object({
  ...datosDelEmpleado,
  correo: correoObligatorio(
    'El correo es obligatorio: ahí llega la invitación.',
    'El correo admite hasta 254 caracteres.',
    'El correo no tiene un formato válido.',
  ),
})

export type DatosEdicionUsuario = z.output<typeof esquemaEdicionUsuario>
export type DatosNuevoUsuario = z.output<typeof esquemaNuevoUsuario>

export const camposDeUsuario = ['nombres', 'apellidos', 'telefono', 'roles'] as const satisfies readonly Path<DatosEdicionUsuario>[]
export const camposDeNuevoUsuario = [...camposDeUsuario, 'correo'] as const satisfies readonly Path<DatosNuevoUsuario>[]

export const nuevoUsuarioVacio: DatosNuevoUsuario = { nombres: '', apellidos: '', correo: '', telefono: '', roles: [] }

export function datosDeUsuario(usuario: Usuario): DatosEdicionUsuario {
  return { nombres: usuario.nombres, apellidos: usuario.apellidos, telefono: usuario.telefono ?? '', roles: [...usuario.roles] }
}

export const nombreDelUsuario = (usuario: Usuario) => `${usuario.nombres} ${usuario.apellidos}`

export const crearUsuario = (datos: DatosNuevoUsuario) => api.post<Usuario>('/api/users', datos)
export const editarUsuario = (id: number, datos: DatosEdicionUsuario) => api.put<Usuario>(`/api/users/${id}`, datos)
export const desactivarUsuario = (id: number) => api.post(`/api/users/${id}/deactivate`)
export const activarUsuario = (id: number) => api.post(`/api/users/${id}/activate`)
export const reenviarInvitacion = (id: number) => api.post(`/api/users/${id}/resend-invite`)
