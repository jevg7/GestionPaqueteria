import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SesionContext, type Sesion } from '../auth/session'

const acceso = vi.hoisted(() => ({
  configurado: true,
  auth: {
    initialize: vi.fn(),
    signInWithPassword: vi.fn(),
    updateUser: vi.fn(),
  },
}))
vi.mock('../lib/supabase', () => ({
  modoDemo: false,
  get supabase() {
    return acceso.configurado ? { auth: acceso.auth } : null
  },
}))
import { AceptarInvitacion, Login } from './Auth'

function abrir(path = '/login', autenticado = false) {
  const sesion: Sesion = {
    cargando: false,
    autenticado,
    error: null,
    demo: false,
    entrarDemo: vi.fn(),
    salir: vi.fn().mockResolvedValue(undefined),
    reintentar: vi.fn(),
  }
  render(
    <SesionContext.Provider value={sesion}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/aceptar-invitacion" element={<AceptarInvitacion />} />
          <Route path="/inicio" element={<h1>Espacio autenticado</h1>} />
        </Routes>
      </MemoryRouter>
    </SesionContext.Provider>,
  )
}
function ingresar() {
  fireEvent.change(screen.getByLabelText('Correo electrónico'), {
    target: { value: ' agente@example.com ' },
  })
  fireEvent.change(screen.getByLabelText('Contraseña'), {
    target: { value: 'contraseña-de-prueba' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
}
function crearPassword() {
  fireEvent.change(screen.getByLabelText('Nueva contraseña'), {
    target: { value: 'contraseña-de-prueba' },
  })
  fireEvent.change(screen.getByLabelText('Confirmar contraseña'), {
    target: { value: 'contraseña-de-prueba' },
  })
  fireEvent.click(
    screen.getByRole('button', { name: 'Crear contraseña y continuar' }),
  )
}

beforeEach(() => {
  acceso.configurado = true
  acceso.auth.initialize.mockReset().mockResolvedValue({ error: null })
  acceso.auth.signInWithPassword.mockReset().mockResolvedValue({ error: null })
  acceso.auth.updateUser.mockReset().mockResolvedValue({ error: null })
})

describe('Acceso con Supabase en modo conectado', () => {
  it('envía las credenciales validadas a Auth y abre el inicio al autenticarse', async () => {
    abrir()
    ingresar()
    expect(
      await screen.findByRole('heading', { name: 'Espacio autenticado' }),
    ).toBeInTheDocument()
    expect(acceso.auth.signInWithPassword).toHaveBeenCalledExactlyOnceWith({
      email: 'agente@example.com',
      password: 'contraseña-de-prueba',
    })
  })

  it('mantiene el acceso abierto y muestra el rechazo de credenciales', async () => {
    acceso.auth.signInWithPassword.mockResolvedValue({
      error: { code: 'invalid_credentials' },
    })
    abrir()
    ingresar()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El correo o la contraseña no son correctos.',
    )
    expect(
      screen.queryByRole('heading', { name: 'Espacio autenticado' }),
    ).not.toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Iniciar sesión' }),
      ).toBeEnabled(),
    )
  })

  it('informa una caída de Auth sin navegar al espacio privado', async () => {
    acceso.auth.signInWithPassword.mockRejectedValue(new TypeError('Red caída'))
    abrir()
    ingresar()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo conectar con el servicio de acceso.',
    )
    expect(
      screen.queryByRole('heading', { name: 'Espacio autenticado' }),
    ).not.toBeInTheDocument()
  })

  it('deshabilita el ingreso mientras faltan las credenciales públicas', () => {
    acceso.configurado = false
    abrir()
    expect(
      screen.getByRole('button', { name: 'Iniciar sesión' }),
    ).toBeDisabled()
    expect(
      screen.getByText(/El acceso se habilitará cuando se configure/),
    ).toBeInTheDocument()
    expect(acceso.auth.signInWithPassword).not.toHaveBeenCalled()
  })
})

describe('Aceptación de invitaciones en modo conectado', () => {
  it('guarda la contraseña de la sesión recibida por la invitación', async () => {
    abrir('/aceptar-invitacion', true)
    await screen.findByLabelText('Nueva contraseña')
    crearPassword()
    expect(
      await screen.findByRole('heading', { name: 'Espacio autenticado' }),
    ).toBeInTheDocument()
    expect(acceso.auth.updateUser).toHaveBeenCalledExactlyOnceWith({
      password: 'contraseña-de-prueba',
    })
  })

  it('conserva el formulario si Auth rechaza la nueva contraseña', async () => {
    acceso.auth.updateUser.mockResolvedValue({
      error: { code: 'weak_password' },
    })
    abrir('/aceptar-invitacion', true)
    await screen.findByLabelText('Nueva contraseña')
    crearPassword()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo guardar la contraseña.',
    )
    expect(
      screen.queryByRole('heading', { name: 'Espacio autenticado' }),
    ).not.toBeInTheDocument()
  })

  it('pide una invitación nueva cuando el enlace no dejó una sesión válida', () => {
    abrir('/aceptar-invitacion')
    expect(screen.getByText(/Si venció o ya se utilizó/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Nueva contraseña')).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Volver al inicio' }),
    ).toHaveAttribute('href', '/login')
    expect(acceso.auth.updateUser).not.toHaveBeenCalled()
  })

  it.each([
    '#error=access_denied&error_code=otp_expired',
    '?error_description=Email+link+is+invalid',
    '?error_code=otp_expired',
  ])(
    'bloquea un enlace fallido %s aunque haya otra sesión abierta',
    async (errorUrl) => {
      abrir(`/aceptar-invitacion${errorUrl}`, true)
      expect(
        await screen.findByText(/Si venció o ya se utilizó/),
      ).toBeInTheDocument()
      expect(
        screen.queryByLabelText('Nueva contraseña'),
      ).not.toBeInTheDocument()
      expect(acceso.auth.updateUser).not.toHaveBeenCalled()
    },
  )

  it('bloquea un token de enlace rechazado por el SDK aunque conserve la sesión anterior', async () => {
    acceso.auth.initialize.mockResolvedValue({
      error: { code: 'bad_jwt' },
    })
    abrir('/aceptar-invitacion', true)
    expect(
      await screen.findByText(/Si venció o ya se utilizó/),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Nueva contraseña')).not.toBeInTheDocument()
    expect(acceso.auth.updateUser).not.toHaveBeenCalled()
  })
})
