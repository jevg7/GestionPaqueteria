import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
vi.mock('./lib/supabase', () => ({ modoDemo: true, supabase: null }))
import App from './App'
import { SessionProvider } from './auth/SessionProvider'
import * as cliente from './lib/api'
import { ErrorApi } from './lib/api-error'

const clientes: QueryClient[] = []
function abrir(path = '/', rol?: string) {
  if (rol) sessionStorage.setItem('paqueteo:demo-rol', rol)
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  clientes.push(client)
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <SessionProvider>
          <App />
        </SessionProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return client
}
afterEach(() => {
  clientes.forEach((c) => c.clear())
  clientes.length = 0
  vi.restoreAllMocks()
})

it('redirige una ruta privada al acceso y permite entrar a la demostración', async () => {
  abrir('/usuarios')
  expect(
    await screen.findByRole('heading', { name: 'Bienvenido a tu espacio' }),
  ).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Abrir demostración' }))
  expect(
    await screen.findByRole('heading', { name: 'Hola, Ana.' }),
  ).toBeInTheDocument()
  expect(screen.getByText('Espacio de demostración.')).toBeInTheDocument()
})
it.each(['AGENTE', 'BODEGA', 'REPARTIDOR', 'PLATAFORMA'])(
  'bloquea la ruta de usuarios para %s aunque se escriba directamente',
  async (rol) => {
    abrir('/usuarios', rol)
    expect(
      await screen.findByRole('heading', {
        name: 'Este espacio requiere otro permiso',
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Usuarios y roles' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Invitar usuario' }),
    ).not.toBeInTheDocument()
  },
)
it('la plataforma ve agencias y no recibe navegación hacia datos de la agencia', async () => {
  abrir('/plataforma/agencias', 'PLATAFORMA')
  expect(
    await screen.findByRole('table', { name: 'Agencias de la plataforma' }),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('link', { name: 'Tarifas de envío' }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('link', { name: 'Usuarios y roles' }),
  ).not.toBeInTheDocument()
})
it.each(['AGENTE', 'BODEGA', 'REPARTIDOR', 'PLATAFORMA'])(
  'bloquea la contabilidad y su navegación para %s',
  async (rol) => {
    abrir('/contabilidad', rol)
    expect(
      await screen.findByRole('heading', {
        name: 'Este espacio requiere otro permiso',
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Contabilidad' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Registrar gasto' }),
    ).not.toBeInTheDocument()
  },
)
it('BODEGA consulta tarifas sin acciones de creación o anulación', async () => {
  abrir('/tarifas', 'BODEGA')
  expect(
    await screen.findByRole('table', { name: 'Historial de tarifas de envío' }),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Nueva tarifa' }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: /Anular tarifa/ }),
  ).not.toBeInTheDocument()
})
it('cambiar de rol elimina de la caché los datos del administrador', async () => {
  const client = abrir('/usuarios', 'ADMIN')
  await screen.findByRole('table', { name: 'Usuarios de la agencia' })
  expect(
    client.getQueriesData({ queryKey: ['usuarios'] }).length,
  ).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('link', { name: 'Cambiar rol' }))
  const select = await screen.findByLabelText('¿Desde qué rol quieres entrar?')
  fireEvent.change(select, { target: { value: 'AGENTE' } })
  fireEvent.click(screen.getByRole('button', { name: 'Abrir demostración' }))
  await screen.findByRole('heading', { name: 'Hola, Ana.' })
  expect(
    client
      .getQueriesData({ queryKey: ['usuarios'] })
      .every(([, data]) => data === undefined),
  ).toBe(true)
  expect(
    screen.queryByRole('link', { name: 'Usuarios y roles' }),
  ).not.toBeInTheDocument()
})
it('valida la invitación antes de registrar un usuario de ejemplo', async () => {
  abrir('/usuarios', 'ADMIN')
  await screen.findByRole('table', { name: 'Usuarios de la agencia' })
  fireEvent.click(screen.getByRole('button', { name: 'Invitar usuario' }))
  const dialogo = await screen.findByRole('dialog')
  fireEvent.click(
    within(dialogo).getByRole('button', { name: 'Enviar invitación' }),
  )
  expect(
    await within(dialogo).findAllByText('Este campo es obligatorio.'),
  ).toHaveLength(2)
  fireEvent.change(within(dialogo).getByLabelText('Nombres'), {
    target: { value: 'Andrea' },
  })
  fireEvent.change(within(dialogo).getByLabelText('Apellidos'), {
    target: { value: 'Prueba' },
  })
  fireEvent.change(within(dialogo).getByLabelText('Correo electrónico'), {
    target: { value: 'andrea.prueba@example.com' },
  })
  await act(async () => {
    fireEvent.click(
      within(dialogo).getByRole('button', { name: 'Enviar invitación' }),
    )
  })
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  )
  expect(await screen.findByText('Andrea Prueba')).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Demostración:')
})
it('muestra el mensaje de bloqueo de /me en lugar del layout privado', async () => {
  const original = cliente.api
  vi.spyOn(cliente, 'api').mockImplementation((path, options) =>
    path === '/api/me'
      ? Promise.reject(
          new ErrorApi(403, { detail: 'La agencia está suspendida.' }),
        )
      : original(path, options),
  )
  abrir('/inicio', 'ADMIN')
  expect(
    await screen.findByRole('heading', {
      name: 'Tu acceso no está disponible',
    }),
  ).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent(
    'La agencia está suspendida.',
  )
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
})
