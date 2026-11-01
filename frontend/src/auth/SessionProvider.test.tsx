import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Identidad } from '../types'

type SesionSimulada = { user: { id: string }; access_token: string }
const auth = vi.hoisted(() => ({
  notificar: undefined as
    | ((event: string, session: SesionSimulada | null) => void)
    | undefined,
  unsubscribe: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('../lib/supabase', () => ({
  modoDemo: false,
  supabase: {
    auth: {
      onAuthStateChange: (
        callback: (event: string, session: SesionSimulada | null) => void,
      ) => {
        auth.notificar = callback
        return { data: { subscription: { unsubscribe: auth.unsubscribe } } }
      },
      signOut: auth.signOut,
    },
  },
}))
vi.mock('../lib/api', () => ({ api: vi.fn() }))

import { api } from '../lib/api'
import { ErrorApi } from '../lib/api-error'
import { SessionProvider } from './SessionProvider'
import { useSesion } from './session'

const identidad: Identidad = {
  tipo: 'AGENCIA',
  id: 1,
  nombres: 'Ana',
  apellidos: 'Pérez',
  correo: 'ana@example.com',
  roles: ['ADMIN'],
  agencia: { id: 10, nombre: 'Agencia Uno', estado: 'ACTIVA' },
}
const sesion: SesionSimulada = {
  user: { id: 'auth-ana' },
  access_token: 'token-inicial',
}
const clientes: QueryClient[] = []

function VistaSesion() {
  const { autenticado, cargando, usuario, error } = useSesion()
  return (
    <>
      <span data-testid="autenticado">{String(autenticado)}</span>
      <span data-testid="cargando">{String(cargando)}</span>
      <span data-testid="roles">{usuario?.roles.join(',') ?? ''}</span>
      <span data-testid="agencia">{usuario?.agencia?.id ?? ''}</span>
      {error instanceof Error && <span role="alert">{error.message}</span>}
    </>
  )
}

function VistaTarifas() {
  const { usuario } = useSesion()
  const tarifas = useQuery({
    queryKey: ['tarifas-actuales'],
    queryFn: ({ signal }) => api<string[]>('/api/rates/current', { signal }),
    enabled: !!usuario?.roles.some((rol) => ['ADMIN', 'AGENTE'].includes(rol)),
  })
  return <span data-testid="tarifas">{tarifas.data?.join(',') ?? ''}</span>
}

async function abrir(conTarifas = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clientes.push(client)
  render(
    <QueryClientProvider client={client}>
      <SessionProvider>
        <VistaSesion />
        {conTarifas && <VistaTarifas />}
      </SessionProvider>
    </QueryClientProvider>,
  )
  act(() => auth.notificar?.('INITIAL_SESSION', sesion))
  await waitFor(() =>
    expect(screen.getByTestId('roles')).toHaveTextContent('ADMIN'),
  )
  return client
}

function revalidar() {
  act(() => {
    window.dispatchEvent(new Event('paqueteo:revalidar-acceso'))
  })
}

beforeEach(() => {
  vi.mocked(api).mockReset().mockResolvedValue(identidad)
  auth.signOut.mockReset().mockResolvedValue({ error: null })
  auth.unsubscribe.mockClear()
})
afterEach(() => {
  clientes.forEach((client) => client.clear())
  clientes.length = 0
  vi.restoreAllMocks()
})

it('elimina datos previos si /me cambia los roles del mismo usuario', async () => {
  const client = await abrir()
  client.setQueryData(['usuarios'], ['Datos exclusivos de administración'])
  client.setQueryData(['tarifas-actuales'], ['Tarifa anterior'])
  vi.mocked(api).mockResolvedValue({ ...identidad, roles: ['AGENTE'] })

  revalidar()

  await waitFor(() =>
    expect(screen.getByTestId('roles')).toHaveTextContent('AGENTE'),
  )
  expect(client.getQueryData(['usuarios'])).toBeUndefined()
  expect(client.getQueryData(['tarifas-actuales'])).toBeUndefined()
  expect(client.getQueryData(['identidad', sesion.user.id])).toMatchObject({
    id: identidad.id,
    roles: ['AGENTE'],
  })
})

it('cancela consultas anteriores antes de descartar sus datos', async () => {
  const client = await abrir()
  let terminar: ((value: string[]) => void) | undefined
  let signalAnterior: AbortSignal | undefined
  const pendiente = client.fetchQuery({
    queryKey: ['usuarios'],
    queryFn: ({ signal }) => {
      signalAnterior = signal
      return new Promise<string[]>((resolve) => {
        terminar = resolve
      })
    },
  })
  const resultado = pendiente.catch(() => undefined)
  vi.mocked(api).mockResolvedValue({ ...identidad, roles: ['AGENTE'] })

  revalidar()

  await waitFor(() =>
    expect(screen.getByTestId('roles')).toHaveTextContent('AGENTE'),
  )
  expect(signalAnterior?.aborted).toBe(true)
  terminar?.(['Respuesta antigua de administración'])
  await resultado
  expect(client.getQueryData(['usuarios'])).toBeUndefined()
})

it('descarta los datos de una agencia al cambiar la agencia de la identidad', async () => {
  const client = await abrir()
  client.setQueryData(['rutas'], ['Ruta de la agencia anterior'])
  vi.mocked(api).mockResolvedValue({
    ...identidad,
    agencia: { id: 20, nombre: 'Agencia Dos', estado: 'ACTIVA' },
  })

  revalidar()

  await waitFor(() =>
    expect(screen.getByTestId('agencia')).toHaveTextContent('20'),
  )
  expect(client.getQueryData(['rutas'])).toBeUndefined()
})

it('reconecta una consulta activa y carga los datos del nuevo alcance', async () => {
  let acceso: Identidad = identidad
  const consultasTarifas = vi.fn(() =>
    Promise.resolve(
      acceso.agencia?.id === 10 ? ['Tarifa agencia uno'] : ['Tarifa agencia dos'],
    ),
  )
  vi.mocked(api).mockImplementation(<T,>(path: string) => {
    return (path === '/api/me'
      ? Promise.resolve(acceso)
      : consultasTarifas()) as Promise<T>
  })
  const client = await abrir(true)
  await waitFor(() =>
    expect(screen.getByTestId('tarifas')).toHaveTextContent('Tarifa agencia uno'),
  )
  acceso = {
    ...identidad,
    agencia: { id: 20, nombre: 'Agencia Dos', estado: 'ACTIVA' },
  }

  revalidar()

  await waitFor(() =>
    expect(screen.getByTestId('tarifas')).toHaveTextContent('Tarifa agencia dos'),
  )
  expect(consultasTarifas).toHaveBeenCalledTimes(2)
  expect(client.getQueryData(['tarifas-actuales'])).toEqual(['Tarifa agencia dos'])
  expect(
    client.getQueryCache().find({ queryKey: ['tarifas-actuales'] })
      ?.getObserversCount(),
  ).toBe(1)
})

it('una revalidación cancelada no elimina los datos de una nueva sesión', async () => {
  const client = await abrir()
  const cancelar = client.cancelQueries.bind(client)
  let permitirCancelacion: (() => void) | undefined
  vi.spyOn(client, 'cancelQueries').mockImplementation((filters, options) => {
    if (filters?.predicate) {
      return new Promise<void>((resolve) => {
        permitirCancelacion = resolve
      })
    }
    return cancelar(filters, options)
  })
  vi.mocked(api).mockResolvedValue({ ...identidad, roles: ['AGENTE'] })
  revalidar()
  await waitFor(() => expect(permitirCancelacion).toBeDefined())

  await act(async () => {
    auth.notificar?.('SIGNED_IN', {
      user: { id: 'otro-usuario' },
      access_token: 'otro-token',
    })
  })
  await waitFor(() =>
    expect(screen.getByTestId('roles')).toHaveTextContent('AGENTE'),
  )
  client.setQueryData(['usuarios'], ['Datos de la nueva sesión'])

  await act(async () => permitirCancelacion?.())

  expect(client.getQueryData(['usuarios'])).toEqual(['Datos de la nueva sesión'])
})

it('conserva datos si solo cambia el orden de roles sin cambiar permisos', async () => {
  vi.mocked(api).mockResolvedValue({
    ...identidad,
    roles: ['ADMIN', 'AGENTE'],
  })
  const client = await abrir()
  client.setQueryData(['usuarios'], ['Equipo de la agencia'])
  vi.mocked(api).mockResolvedValue({
    ...identidad,
    roles: ['AGENTE', 'ADMIN'],
  })

  revalidar()

  await waitFor(() =>
    expect(screen.getByTestId('roles')).toHaveTextContent('AGENTE,ADMIN'),
  )
  expect(client.getQueryData(['usuarios'])).toEqual(['Equipo de la agencia'])
})

it('elimina datos al bloquearse el acceso aunque el JWT siga vigente', async () => {
  const client = await abrir()
  client.setQueryData(['usuarios'], ['Equipo de la agencia'])
  vi.mocked(api).mockRejectedValue(
    new ErrorApi(403, { detail: 'La agencia está suspendida.' }),
  )

  revalidar()

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'La agencia está suspendida.',
  )
  expect(screen.getByTestId('roles')).toBeEmptyDOMElement()
  expect(client.getQueryData(['usuarios'])).toBeUndefined()
  expect(screen.getByTestId('autenticado')).toHaveTextContent('true')
})

it('conserva la identidad y los datos al renovarse el token del mismo usuario', async () => {
  const client = await abrir()
  client.setQueryData(['usuarios'], ['Equipo de la agencia'])

  act(() =>
    auth.notificar?.('TOKEN_REFRESHED', {
      ...sesion,
      access_token: 'token-renovado',
    }),
  )

  expect(screen.getByTestId('autenticado')).toHaveTextContent('true')
  expect(screen.getByTestId('roles')).toHaveTextContent('ADMIN')
  expect(client.getQueryData(['usuarios'])).toEqual(['Equipo de la agencia'])
})

it('cierra la sesión local y limpia los datos ante una sesión expirada', async () => {
  const client = await abrir()
  client.setQueryData(['usuarios'], ['Equipo de la agencia'])

  act(() => {
    window.dispatchEvent(new Event('paqueteo:sesion-vencida'))
  })

  await waitFor(() =>
    expect(screen.getByTestId('autenticado')).toHaveTextContent('false'),
  )
  expect(client.getQueryData(['usuarios'])).toBeUndefined()
  expect(screen.getByTestId('roles')).toBeEmptyDOMElement()
  expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
})
