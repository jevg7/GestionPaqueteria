import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, esErrorPasajero, mensajeDeError } from './api.ts'

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('./env.ts', () => ({ env: { VITE_API_URL: 'https://api.test' } }))
vi.mock('./supabase.ts', () => ({ supabase: { auth: { getSession } } }))

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  getSession.mockResolvedValue({ data: { session: { access_token: 'token-de-prueba' } } })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

function respuestaJson(status: number, cuerpo: unknown, tipo = 'application/json') {
  return new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': `${tipo}; charset=utf-8` } })
}

function problema(status: number, cuerpo: object) {
  return respuestaJson(status, { status, ...cuerpo }, 'application/problem+json')
}

function primeraLlamada() {
  const [url, init] = fetchMock.mock.calls[0]
  return { url: String(url), init: init!, encabezados: new Headers(init!.headers) }
}

describe('api', () => {
  it('adjunta el token de la sesión y omite los filtros vacíos', async () => {
    fetchMock.mockResolvedValue(respuestaJson(200, { items: [] }))

    await api.get('/api/clients', {
      params: { search: 'ana lópez', activo: false, page: 2, estado: '', clienteId: undefined, metodoEnvio: null },
    })

    const { url, init, encabezados } = primeraLlamada()
    expect(url).toBe('https://api.test/api/clients?search=ana+l%C3%B3pez&activo=false&page=2')
    expect(init.method).toBe('GET')
    expect(init.body).toBeUndefined()
    expect(encabezados.get('Authorization')).toBe('Bearer token-de-prueba')
  })

  it('sin sesión no envía Authorization', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    fetchMock.mockResolvedValue(respuestaJson(200, { status: 'ok' }))

    await api.get('/health')

    expect(primeraLlamada().encabezados.has('Authorization')).toBe(false)
  })

  it('envía el cuerpo como JSON y devuelve la respuesta', async () => {
    fetchMock.mockResolvedValue(respuestaJson(201, { id: 7, codigo: 'CLI-000007' }))

    const creado = await api.post<{ id: number; codigo: string }>('/api/clients', { nombres: 'Ana' })

    const { init, encabezados } = primeraLlamada()
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"nombres":"Ana"}')
    expect(encabezados.get('Content-Type')).toBe('application/json')
    expect(creado).toEqual({ id: 7, codigo: 'CLI-000007' })
  })

  it('una respuesta 204 devuelve undefined y sin cuerpo no envía Content-Type', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    await expect(api.post('/api/clients/7/deactivate')).resolves.toBeUndefined()
    expect(primeraLlamada().encabezados.has('Content-Type')).toBe(false)
  })
})

describe('errores', () => {
  it('usa el detail del backend como mensaje', async () => {
    const detail = 'El paquete PKG-000001 está ENTREGADO y no puede pasar a CANCELADO.'
    fetchMock.mockResolvedValue(problema(409, { title: 'Conflict', detail, traceId: '0HN:1' }))

    const error = await api.post('/api/packages/1/cancel', { motivo: 'x' }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: detail, detail, traceId: '0HN:1' })
  })

  it('con errores de validación da un mensaje general y conserva los errores por campo', async () => {
    const errors = { Telefono: ['El teléfono es obligatorio: es el canal para notificar al cliente.'] }
    fetchMock.mockResolvedValue(problema(400, { title: 'One or more validation errors occurred.', errors }))

    await expect(api.post('/api/clients', {})).rejects.toMatchObject({
      status: 400,
      message: 'Revise los datos ingresados.',
      errors,
    })
  })

  it.each([
    [401, 'Su sesión no es válida o expiró. Inicie sesión de nuevo.'],
    [403, 'No tiene permiso para realizar esta acción.'],
    [404, 'No se encontró el registro solicitado.'],
    [409, 'La operación no se puede realizar en el estado actual.'],
    [503, 'El servicio no está disponible. Intente de nuevo en unos minutos.'],
    [500, 'Ocurrió un error inesperado. Intente de nuevo.'],
  ])('sin detail, un %i tiene un mensaje en español', async (status, mensaje) => {
    fetchMock.mockResolvedValue(problema(status, { title: 'Error', traceId: 't' }))

    await expect(api.get('/api/me')).rejects.toMatchObject({ status, message: mensaje })
  })

  it('una respuesta de error que no es JSON también da un ApiError', async () => {
    fetchMock.mockResolvedValue(new Response('Bad Gateway', { status: 502, headers: { 'Content-Type': 'text/plain' } }))

    await expect(api.get('/api/me')).rejects.toMatchObject({
      status: 502,
      message: 'Ocurrió un error inesperado. Intente de nuevo.',
    })
  })

  it('sin respuesta del servidor el estado es 0', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(api.get('/health')).rejects.toMatchObject({
      status: 0,
      message: 'No se pudo conectar con el servidor. Revise su conexión e intente de nuevo.',
    })
  })

  it('una solicitud cancelada no se convierte en ApiError', async () => {
    const control = new AbortController()
    control.abort()
    const cancelacion = new DOMException('Cancelada', 'AbortError')
    fetchMock.mockRejectedValue(cancelacion)

    await expect(api.get('/health', { signal: control.signal })).rejects.toBe(cancelacion)
  })
})

describe('esErrorPasajero y mensajeDeError', () => {
  it('solo es pasajero sin conexión o con una falla del servidor', () => {
    expect([0, 500, 503].map((s) => esErrorPasajero(new ApiError(s)))).toEqual([true, true, true])
    expect([400, 401, 403, 404, 409].map((s) => esErrorPasajero(new ApiError(s)))).toEqual([false, false, false, false, false])
    expect(esErrorPasajero(new Error('otro'))).toBe(false)
  })

  it('mensajeDeError nunca muestra un mensaje técnico', () => {
    expect(mensajeDeError(new ApiError(409, { detail: 'Mensaje del backend' }))).toBe('Mensaje del backend')
    expect(mensajeDeError(new TypeError('x is undefined'))).toBe('Ocurrió un error inesperado. Intente de nuevo.')
  })
})
