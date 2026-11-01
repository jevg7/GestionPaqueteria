import { describe, expect, it } from 'vitest'
import { leerConfiguracion } from './config'

const entorno = {
  VITE_SUPABASE_URL: 'https://proyecto.supabase.co/',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_prueba',
}
const jwt = (role: string) => `cabecera.${btoa(JSON.stringify({ role }))}.firma`

describe('Configuración de la conexión real', () => {
  it('usa la API HTTPS local y normaliza URLs y espacios', () => {
    expect(leerConfiguracion(entorno)).toMatchObject({
      modoDemo: false,
      apiUrl: 'https://localhost:7225',
      supabaseUrl: 'https://proyecto.supabase.co',
      errores: [],
    })
    expect(
      leerConfiguracion({
        ...entorno,
        VITE_API_URL: ' https://api.example.com/ ',
      }).apiUrl,
    ).toBe('https://api.example.com')
  })
  it('detecta credenciales pendientes sin activar la demostración', () => {
    expect(leerConfiguracion({})).toMatchObject({ modoDemo: false })
    expect(leerConfiguracion({}).errores).toHaveLength(2)
  })
  it.each(['sb_secret_prueba', jwt('service_role'), 'clave-invalida'])(
    'rechaza una clave privada o inválida: %s',
    (key) => {
      expect(
        leerConfiguracion({ ...entorno, VITE_SUPABASE_PUBLISHABLE_KEY: key })
          .errores,
      ).toContain(
        'VITE_SUPABASE_PUBLISHABLE_KEY debe contener una clave pública publishable o anon.',
      )
    },
  )
  it('admite una clave anon heredada', () => {
    expect(
      leerConfiguracion({
        ...entorno,
        VITE_SUPABASE_PUBLISHABLE_KEY: jwt('anon'),
      }).errores,
    ).toEqual([])
  })
  it.each([
    'http://api.example.com',
    'https://usuario:secreto@api.example.com',
    'javascript:alert(1)',
    'https://api.example.com/?token=secreto',
  ])('rechaza una URL de API inválida: %s', (url) => {
    expect(
      leerConfiguracion({ ...entorno, VITE_API_URL: url }).errores,
    ).not.toEqual([])
  })
  it('permite HTTP en localhost para desarrollo', () => {
    expect(
      leerConfiguracion({ ...entorno, VITE_API_URL: 'http://127.0.0.1:5102' })
        .errores,
    ).toEqual([])
  })
  it('solo permite demostración cuando se solicita explícitamente', () => {
    expect(leerConfiguracion({ VITE_DEMO_MODE: 'true' })).toMatchObject({
      modoDemo: true,
      errores: [],
    })
    expect(leerConfiguracion({ VITE_DEMO_MODE: 'false' }).modoDemo).toBe(false)
  })
})
