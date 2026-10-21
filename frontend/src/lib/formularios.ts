import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { ApiError, mensajeDeError } from './errores.ts'

/**
 * Nombre del campo del formulario para una clave de error del backend. Las claves llegan con los nombres de
 * C# ("Admin.Correo") o, si el JSON no se pudo leer, como ruta ("$.admin.correo"); el formulario usa camelCase.
 * prefijo sirve para formularios que anidan los datos que la API recibe en la raíz.
 */
export function campoDeErrorDelBackend(clave: string, prefijo = ''): string {
  const ruta = clave
    .replace(/^\$\./, '')
    .split('.')
    .map((parte) => parte.charAt(0).toLowerCase() + parte.slice(1))
    .join('.')
  return prefijo + ruta
}

/**
 * Muestra el error de un envío: los errores de validación del backend (400) van a sus campos y el resto se
 * devuelve como mensaje general (que siempre se puede mostrar).
 */
export function mensajeDelEnvio<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  campos: readonly Path<T>[],
  prefijo = '',
): string {
  if (!(error instanceof ApiError && error.status === 400 && error.errors)) return mensajeDeError(error)
  const sinCampo: string[] = []
  for (const [clave, mensajes] of Object.entries(error.errors)) {
    const campo = campoDeErrorDelBackend(clave, prefijo)
    if ((campos as readonly string[]).includes(campo)) setError(campo as Path<T>, { type: 'server', message: mensajes[0] })
    else sinCampo.push(...mensajes)
  }
  return sinCampo.length > 0 ? sinCampo.join(' ') : error.message
}
