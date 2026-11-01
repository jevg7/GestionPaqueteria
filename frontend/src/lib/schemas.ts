import { z } from 'zod'
import { fechaManagua } from './format'
const texto = (max: number) =>
  z
    .string()
    .trim()
    .min(1, 'Este campo es obligatorio.')
    .max(max, `Máximo ${max} caracteres.`)
const correo = z.string().trim().max(254).email('Escribe un correo válido.')
const correoOpcional = z.union([correo, z.literal('')])
const telefono = z
  .string()
  .trim()
  .max(30)
  .refine(
    (v) => !v || /^\+?[0-9 ()-]*[0-9][0-9 ()-]*$/.test(v),
    'Escribe un teléfono válido.',
  )
const precio = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,4})?$/, 'Usa un número con hasta 4 decimales.')
  .refine(
    (v) => Number(v) > 0 && Number(v) <= 99999999.9999,
    'El valor debe ser mayor que cero y menor que 100 millones.',
  )
export const loginSchema = z.object({
  correo,
  password: z.string().min(1, 'Escribe tu contraseña.'),
})
export const passwordSchema = z
  .object({
    password: z.string().min(8, 'Usa al menos 8 caracteres.'),
    confirmar: z.string(),
  })
  .refine((v) => v.password === v.confirmar, {
    path: ['confirmar'],
    message: 'Las contraseñas no coinciden.',
  })
export const agenciaSchema = z.object({
  nombre: texto(150),
  ruc: z.string().trim().max(30),
  correoContacto: correoOpcional,
  telefono,
})
export const nuevaAgenciaSchema = agenciaSchema.extend({
  nombres: texto(100),
  apellidos: texto(100),
  correo,
  telefonoAdmin: telefono,
})
export const usuarioSchema = z.object({
  nombres: texto(100),
  apellidos: texto(100),
  telefono,
  roles: z
    .array(z.enum(['ADMIN', 'AGENTE', 'BODEGA', 'REPARTIDOR']))
    .min(1, 'Selecciona al menos un rol.'),
})
export const nuevoUsuarioSchema = usuarioSchema.extend({ correo })
export const tarifaSchema = z.object({
  metodoEnvio: texto(20),
  precioPorUnidad: precio,
  fechaInicio: z
    .string()
    .refine(
      (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && v >= fechaManagua(),
      'Selecciona hoy o una fecha futura, en hora de Managua.',
    ),
})
export const cambioSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Selecciona una fecha.'),
  nioPorUsd: precio,
})
export const ubicacionSchema = z.object({
  codigo: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9]{2,10}$/, 'Usa de 2 a 10 letras o dígitos.'),
  nombre: texto(100),
  pais: z.enum(['US', 'NI']),
})
export const renombrarSchema = z.object({ nombre: texto(100) })
export const rutaSchema = renombrarSchema.extend({
  origenId: texto(20),
  destinoId: texto(20),
})
