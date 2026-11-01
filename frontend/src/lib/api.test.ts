import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('./supabase', () => ({
  modoDemo: false,
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'token-de-prueba' } },
        error: null,
      }),
    },
  },
}))
import { api, consulta } from './api'
import { supabase } from './supabase'
type ResultadoSesion = Awaited<
  ReturnType<NonNullable<typeof supabase>['auth']['getSession']>
>

afterEach(() => {
  vi.unstubAllGlobals()
  vi.mocked(supabase!.auth.getSession).mockResolvedValue({
    data: { session: { access_token: 'token-de-prueba' } },
    error: null,
  } as ResultadoSesion)
})
describe('Cliente HTTP preparado para la API', () => {
  it('adjunta el token, serializa el cuerpo y admite 204', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetch)
    await expect(
      api('/api/users/2/deactivate', {
        method: 'POST',
        body: { motivo: 'Prueba' },
      }),
    ).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/users/2/deactivate'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-de-prueba',
        }),
        body: '{"motivo":"Prueba"}',
      }),
    )
  })
  it('muestra detail de ProblemDetails y no el error genérico', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { detail: 'Esta ubicación está en una ruta activa.' },
            { status: 409 },
          ),
        ),
    )
    await expect(
      api('/api/locations/1/deactivate', { method: 'POST' }),
    ).rejects.toThrow('Esta ubicación está en una ruta activa.')
  })
  it('notifica que debe revalidar el acceso cuando otra operación recibe 403', async () => {
    const handler = vi.fn()
    window.addEventListener('paqueteo:revalidar-acceso', handler)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({}, { status: 403 })),
    )
    await expect(api('/api/users')).rejects.toMatchObject({ status: 403 })
    expect(handler).toHaveBeenCalledOnce()
    window.removeEventListener('paqueteo:revalidar-acceso', handler)
  })
  it('no genera un ciclo de revalidación si /me recibe 403', async () => {
    const handler = vi.fn()
    window.addEventListener('paqueteo:revalidar-acceso', handler)
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ detail: 'Agencia suspendida.' }, { status: 403 }),
        ),
    )
    await expect(api('/api/me')).rejects.toThrow('Agencia suspendida.')
    expect(handler).not.toHaveBeenCalled()
    window.removeEventListener('paqueteo:revalidar-acceso', handler)
  })
  it('notifica el vencimiento de sesión ante un 401', async () => {
    const handler = vi.fn()
    window.addEventListener('paqueteo:sesion-vencida', handler)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    )
    await expect(api('/api/users')).rejects.toMatchObject({ status: 401 })
    expect(handler).toHaveBeenCalledOnce()
    window.removeEventListener('paqueteo:sesion-vencida', handler)
  })
  it('cierra la sesión local cuando el SDK ya no tiene sesión y no llama a la API', async () => {
    vi.mocked(supabase!.auth.getSession).mockResolvedValueOnce({
      data: { session: null },
      error: null,
    })
    const handler = vi.fn()
    const fetch = vi.fn()
    window.addEventListener('paqueteo:sesion-vencida', handler)
    vi.stubGlobal('fetch', fetch)
    await expect(api('/api/me')).rejects.toMatchObject({ status: 401 })
    expect(fetch).not.toHaveBeenCalled()
    expect(handler).toHaveBeenCalledOnce()
    window.removeEventListener('paqueteo:sesion-vencida', handler)
  })
  it('obtiene el token vigente para cada solicitud', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async () => Response.json({ ok: true }))
    vi.stubGlobal('fetch', fetch)
    await api('/api/me')
    vi.mocked(supabase!.auth.getSession).mockResolvedValueOnce({
      data: { session: { access_token: 'token-renovado' } },
      error: null,
    } as ResultadoSesion)
    await api('/api/me')
    expect(fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('/api/me'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token-renovado',
        }),
      }),
    )
  })
  it('distingue una cancelación de un fallo de conexión', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('Cancelado', 'AbortError')),
    )
    await expect(api('/api/users')).rejects.toMatchObject({
      name: 'AbortError',
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    )
    await expect(api('/api/users')).rejects.toMatchObject({ status: 0 })
  })
  it('codifica la búsqueda y conserva filtros booleanos false', () => {
    expect(
      consulta('/api/users', { search: 'Ana & José', activo: false, rol: '' }),
    ).toBe('/api/users?search=Ana+%26+Jos%C3%A9&activo=false')
  })
})
