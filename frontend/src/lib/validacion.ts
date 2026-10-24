import { z } from 'zod'
import { instanteEnManagua } from './formato.ts'

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

/**
 * Decimal positivo escrito en un campo de texto (precio, tipo de cambio) con hasta `decimales` decimales,
 * como el [Range] + IValidatableObject del backend. Sale del esquema como número.
 */
export function decimalPositivo(decimales: number, mensajes: { vacio: string; formato: string; cero: string }) {
  const patron = new RegExp(`^\\d{1,8}(\\.\\d{1,${decimales}})?$`)
  return z
    .string()
    .trim()
    .min(1, mensajes.vacio)
    // Vacío ya tiene su mensaje: el formato se revisa solo si se escribió algo.
    .refine((valor) => valor === '' || patron.test(valor), mensajes.formato)
    .transform(Number)
    .refine((valor) => valor > 0, mensajes.cero)
}

/** Un día del calendario de un <input type="date"> ("yyyy-MM-dd"). */
export function diaObligatorio(mensajeVacio: string) {
  return z.string().regex(/^\d{4}-\d{2}-\d{2}$/, mensajeVacio)
}

const telefonoValido = (valor: string) => valor === '' || PATRON_TELEFONO.test(valor)
const TELEFONO_LARGO = 'El teléfono admite hasta 30 caracteres.'
const TELEFONO_FORMATO = 'El teléfono solo admite dígitos, espacios, guiones, paréntesis y un + inicial.'

/** El margen de FechasDelNegocio para relojes desfasados. */
const TOLERANCIA_DEL_RELOJ = 5 * 60_000

/**
 * La fecha de un hecho que se puede registrar después (salida, llegada, entrega), escrita en hora de Managua con
 * <input type="datetime-local">: vacía es "ahora" (null); puede ser pasada, nunca futura, como FechasDelNegocio.DelHecho.
 * `desde`: el instante mínimo y su mensaje (la llegada no antes de la salida).
 */
export function fechaDelHecho(hecho: string, desde?: { instante: string; mensaje: string }, ahora = () => Date.now()) {
  return z
    .string()
    .transform((valor) => (valor ? instanteEnManagua(valor) : null))
    .refine(
      (instante) => instante === null || Date.parse(instante) <= ahora() + TOLERANCIA_DEL_RELOJ,
      `La fecha de ${hecho} no puede ser futura.`,
    )
    .refine((instante) => instante === null || !desde || Date.parse(instante) >= Date.parse(desde.instante), desde?.mensaje)
}

/** Un motivo obligatorio (anular, cancelar, marcar fallido), con el mensaje del DTO de la API. */
export const esquemaDeMotivo = (mensajeVacio: string) => z.object({ motivo: z.string().trim().min(1, mensajeVacio) })

export type DatosMotivo = z.output<ReturnType<typeof esquemaDeMotivo>>

export const telefonoOpcional = z.string().trim().max(30, TELEFONO_LARGO).refine(telefonoValido, TELEFONO_FORMATO)

/** Teléfono que no puede quedar vacío (el del cliente). */
export function telefonoObligatorio(mensajeVacio: string) {
  return z.string().trim().min(1, mensajeVacio).max(30, TELEFONO_LARGO).refine(telefonoValido, TELEFONO_FORMATO)
}
