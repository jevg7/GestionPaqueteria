import { Component, Suspense, lazy, type ReactNode } from 'react'
import { Link, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { LockKeyhole } from 'lucide-react'
import { useSesion } from './auth/session'
import { Layout } from './components/Layout'
import { Aviso, Cargando, Logo } from './components/ui'
import { ErrorApi, mensajeError } from './lib/api-error'
import { puede, permisos } from './lib/permisos'
import { modoDemo } from './lib/supabase'
import type { Rol } from './types'

const Login = lazy(() =>
  import('./pages/Auth').then((m) => ({ default: m.Login })),
)
const AceptarInvitacion = lazy(() =>
  import('./pages/Auth').then((m) => ({ default: m.AceptarInvitacion })),
)
const Inicio = lazy(() =>
  import('./pages/Inicio').then((m) => ({ default: m.Inicio })),
)
const Agencias = lazy(() =>
  import('./pages/Agencias').then((m) => ({ default: m.Agencias })),
)
const Usuarios = lazy(() =>
  import('./pages/Usuarios').then((m) => ({ default: m.Usuarios })),
)
const Tarifas = lazy(() =>
  import('./pages/Tarifas').then((m) => ({ default: m.Tarifas })),
)
const TipoCambio = lazy(() =>
  import('./pages/TipoCambio').then((m) => ({ default: m.TipoCambio })),
)
const Ubicaciones = lazy(() =>
  import('./pages/Geografia').then((m) => ({ default: m.Ubicaciones })),
)
const Rutas = lazy(() =>
  import('./pages/Geografia').then((m) => ({ default: m.Rutas })),
)
const Contabilidad = lazy(() =>
  import('./pages/Contabilidad').then((m) => ({ default: m.Contabilidad })),
)

function Protegida() {
  const { cargando, autenticado, error, reintentar, salir } = useSesion()
  if (cargando)
    return (
      <div className="full-page-loading">
        <Logo />
        <Cargando label="Preparando tu espacio…" />
      </div>
    )
  if (!autenticado) return <Navigate to="/login" replace />
  if (error)
    return (
      <div className="access-screen">
        <Logo />
        <span className="empty-icon">
          <LockKeyhole size={27} />
        </span>
        <h1>
          {error instanceof ErrorApi && error.status === 403
            ? 'Tu acceso no está disponible'
            : 'No pudimos abrir tu espacio'}
        </h1>
        <Aviso tipo="error">{mensajeError(error)}</Aviso>
        <div className="form-actions">
          <button className="button secondary" onClick={() => void salir()}>
            Cerrar sesión
          </button>
          <button className="button primary" onClick={reintentar}>
            Volver a intentar
          </button>
        </div>
      </div>
    )
  return <Outlet />
}
function PorRol({
  roles,
  children,
}: {
  roles: readonly Rol[]
  children: ReactNode
}) {
  const { usuario } = useSesion()
  return puede(usuario, roles) ? (
    children
  ) : (
    <div className="not-found">
      <span className="empty-icon">
        <LockKeyhole size={28} />
      </span>
      <h1>Este espacio requiere otro permiso</h1>
      <p>Tu rol no permite acceder a esta sección.</p>
      <Link className="button primary" to="/inicio">
        Volver a mi espacio
      </Link>
    </div>
  )
}
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false }
  static getDerivedStateFromError() {
    return { error: true }
  }
  render() {
    if (this.state.error)
      return (
        <div className="access-screen">
          <Logo />
          <h1>No pudimos mostrar esta pantalla</h1>
          <p>Recarga la aplicación para volver a intentarlo.</p>
          <button
            className="button primary"
            onClick={() => window.location.reload()}
          >
            Recargar aplicación
          </button>
        </div>
      )
    return this.props.children
  }
}
export default function App() {
  return (
    <Suspense fallback={<Cargando label="Abriendo pantalla…" />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/demo"
          element={
            modoDemo ? <Login cambiar /> : <Navigate to="/login" replace />
          }
        />
        <Route path="/aceptar-invitacion" element={<AceptarInvitacion />} />
        <Route element={<Protegida />}>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/inicio" replace />} />
            <Route path="/inicio" element={<Inicio />} />
            <Route
              path="/contabilidad"
              element={
                <PorRol roles={permisos.contabilidad}>
                  <Contabilidad />
                </PorRol>
              }
            />
            <Route
              path="/plataforma/agencias"
              element={
                <PorRol roles={permisos.plataforma}>
                  <Agencias />
                </PorRol>
              }
            />
            <Route
              path="/usuarios"
              element={
                <PorRol roles={permisos.usuarios}>
                  <Usuarios />
                </PorRol>
              }
            />
            <Route
              path="/tarifas"
              element={
                <PorRol roles={permisos.tarifas}>
                  <Tarifas />
                </PorRol>
              }
            />
            <Route
              path="/tipo-cambio"
              element={
                <PorRol roles={permisos.cambio}>
                  <TipoCambio />
                </PorRol>
              }
            />
            <Route
              path="/ubicaciones"
              element={
                <PorRol roles={permisos.configuracion}>
                  <Ubicaciones />
                </PorRol>
              }
            />
            <Route
              path="/rutas"
              element={
                <PorRol roles={permisos.configuracion}>
                  <Rutas />
                </PorRol>
              }
            />
            <Route
              path="*"
              element={
                <div className="not-found">
                  <span className="eyebrow">ERROR 404</span>
                  <h1>Este destino no existe</h1>
                  <p>
                    La dirección que buscas no corresponde a una pantalla de la
                    aplicación.
                  </p>
                  <Link className="button primary" to="/inicio">
                    Volver al inicio
                  </Link>
                </div>
              }
            />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  )
}
