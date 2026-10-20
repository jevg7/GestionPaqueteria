import { z } from 'zod'

// Reglas de los formularios iguales a las del backend (DataAnnotations de los DTOs) y con sus mismos
// mensajes: el formulario avisa antes de enviar y la API vuelve a comprobar todo.

// El mismo patrón que [RegularExpression] en los DTOs: dígitos, espacios, guiones, paréntesis y un + inicial.
const PATRON_TELEFONO = /^\s*\+?[0-9 ()-]*[0-9][0-9 ()-]*\s*$/

export function textoObligatorio(mensajeVacio: string, maximo: number, mensajeLargo: string) {
  return z.string().trim().min(1, mensajeVacio).max(maximo, mensajeLargo)
}

export function textoOpcional(maximo: number, mensajeLargo: string) {
  return z.string().trim().max(maximo, mensajeLargo)
}

export function correoObligatorio(mensajeVacio: string, mensajeLargo: string, mensajeFormato: string) {
  return z.string().trim().min(1, mensajeVacio).max(254, mensajeLargo).pipe(z.email(mensajeFormato))
}

/** Correo que puede quedar vacío (la API lo guarda como null). */
export function correoOpcional(mensajeLargo: string, mensajeFormato: string) {
  return z
    .string()
    .trim()
    .max(254, mensajeLargo)
    .refine((valor) => valor === '' || z.email().safeParse(valor).success, mensajeFormato)
}

export const telefonoOpcional = z
  .string()
  .trim()
  .max(30, 'El teléfono admite hasta 30 caracteres.')
  .refine(
    (valor) => valor === '' || PATRON_TELEFONO.test(valor),
    'El teléfono solo admite dígitos, espacios, guiones, paréntesis y un + inicial.',
  )
