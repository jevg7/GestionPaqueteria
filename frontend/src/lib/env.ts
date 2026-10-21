import { z } from 'zod'

// Variables de entorno de frontend/.env.local (plantilla: .env.example). Se validan al cargar la
// aplicación para fallar con un mensaje claro en lugar de errores confusos más adelante.
const esquema = z.object({
  // Siempre https: por http la API redirige a https y el preflight de CORS falla.
  VITE_API_URL: z
    .url()
    .refine((url) => url.startsWith('https://'), 'debe usar https://')
    .transform((url) => url.replace(/\/+$/, '')),
  VITE_SUPABASE_URL: z.url(),
  // Solo la clave publicable: la secreta da acceso de administrador y nunca debe llegar al navegador.
  VITE_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1)
    .refine((clave) => !clave.startsWith('sb_secret_'), 'es una clave secreta: use la publicable (sb_publishable_…)'),
})

const resultado = esquema.safeParse(import.meta.env)
if (!resultado.success) {
  throw new Error(`Configuración inválida en frontend/.env.local:\n${z.prettifyError(resultado.error)}`)
}

export const env = resultado.data
