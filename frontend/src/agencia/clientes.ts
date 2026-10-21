import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import type { Path } from 'react-hook-form'
import { z } from 'zod'
import { api, type Pagina } from '../lib/api.ts'
import { correoOpcional, telefonoObligatorio, textoObligatorio } from '../lib/validacion.ts'

/** ClientResponse del backend. */
export type Cliente = {
  id: number
  codigoCliente: string
  nombres: string
  apellidos: string
  telefono: string
  correo: string | null
  direccion: string | null
  activo: boolean
  fechaRegistro: string
  actualizadoEn: string
}

export const TAMANO_DE_PAGINA = 20

export type FiltrosClientes = { buscar: string; activo: '' | 'true' | 'false'; pagina: number }

/** Raíz de las claves de caché de los clientes: invalidarla refresca listas y detalles. */
export const claveClientes = ['agencia', 'clientes'] as const

export function opcionesListaClientes({ buscar, activo, pagina }: FiltrosClientes) {
  return queryOptions({
    queryKey: [...claveClientes, 'lista', { buscar, activo, pagina }],
    queryFn: ({ signal }) =>
      api.get<Pagina<Cliente>>('/api/clients', {
        params: { search: buscar, activo, page: pagina, pageSize: TAMANO_DE_PAGINA },
        signal,
      }),
    placeholderData: keepPreviousData,
  })
}

export function opcionesCliente(id: number) {
  return queryOptions({
    queryKey: [...claveClientes, 'detalle', id],
    queryFn: ({ signal }) => api.get<Cliente>(`/api/clients/${id}`, { signal }),
  })
}

// Las reglas y mensajes de ClientRequest. Alta y edición envían lo mismo; la API no cambia código ni estado.
export const esquemaCliente = z.object({
  nombres: textoObligatorio('Los nombres son obligatorios.', 100, 'Los nombres admiten hasta 100 caracteres.'),
  apellidos: textoObligatorio('Los apellidos son obligatorios.', 100, 'Los apellidos admiten hasta 100 caracteres.'),
  telefono: telefonoObligatorio('El teléfono es obligatorio: es el canal para notificar al cliente.'),
  correo: correoOpcional('El correo admite hasta 254 caracteres.', 'El correo no tiene un formato válido.'),
  direccion: z.string().trim(),
})

export type DatosCliente = z.output<typeof esquemaCliente>

export const camposDeCliente = ['nombres', 'apellidos', 'telefono', 'correo', 'direccion'] as const satisfies readonly Path<DatosCliente>[]

export const clienteVacio: DatosCliente = { nombres: '', apellidos: '', telefono: '', correo: '', direccion: '' }

export function datosDeCliente(cliente: Cliente): DatosCliente {
  return {
    nombres: cliente.nombres,
    apellidos: cliente.apellidos,
    telefono: cliente.telefono,
    correo: cliente.correo ?? '',
    direccion: cliente.direccion ?? '',
  }
}

/** También sirve para el cliente que trae un paquete (PackageClientRef). */
export const nombreDelCliente = (cliente: { nombres: string; apellidos: string }) => `${cliente.nombres} ${cliente.apellidos}`

// Correo y dirección vacíos viajan como "": la API los guarda como null.
export const crearCliente = (datos: DatosCliente) => api.post<Cliente>('/api/clients', datos)
export const editarCliente = (id: number, datos: DatosCliente) => api.put<Cliente>(`/api/clients/${id}`, datos)
export const desactivarCliente = (id: number) => api.post(`/api/clients/${id}/deactivate`)
export const activarCliente = (id: number) => api.post(`/api/clients/${id}/activate`)
