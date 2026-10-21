import { Navigate, Outlet, useLocation } from 'react-router'
import { Boton } from '../components/Boton.tsx'
import { BotonCerrarSesion } from '../components/BotonCerrarSesion.tsx'
import { Cargando } from '../components/Cargando.tsx'
import { PantallaCentrada } from '../components/PantallaCentrada.tsx'
import { ApiError, mensajeDeError } from '../lib/api.ts'
import { IdentidadContext, useIdentidad } from './identidad.ts'
import { useSesion } from './sesion.ts'

/** Rutas que exigen sesión y una cuenta con acceso según la API (GET /api/me). */
export function AccesoProtegido() {
  const sesion = useSesion()
  const ubicacion = useLocation()
  const identidad = useIdentidad()

  if (sesion === undefined) return <Cargando />
  if (sesion === null) {
    return <Navigate to="/iniciar-sesion" replace state={{ desde: ubicacion.pathname + ubicacion.search }} />
  }

  if (identidad.isPending) return <Cargando texto="Cargando su cuenta…" />

  if (identidad.isError) {
    const error = identidad.error
    // Un 401 ya está cerrando la sesión (queryClient): enseguida se pasa a la pantalla de inicio de sesión.
    if (error instanceof ApiError && error.status === 401) return <Cargando />
    // 403: la cuenta existe pero no tiene acceso; el backend explica el motivo en detail.
    if (error instanceof ApiError && error.status === 403) {
      return (
        <PantallaCentrada titulo="No puede ingresar">
          <p className="text-sm text-slate-600">{error.message}</p>
          <div className="mt-6">
            <BotonCerrarSesion />
          </div>
        </PantallaCentrada>
      )
    }
    return (
      <PantallaCentrada titulo="No se pudo cargar su cuenta">
        <p className="text-sm text-slate-600">{mensajeDeError(error)}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Boton cargando={identidad.isFetching} onClick={() => void identidad.refetch()}>
            Reintentar
          </Boton>
          <BotonCerrarSesion />
        </div>
      </PantallaCentrada>
    )
  }

  return (
    <IdentidadContext value={identidad.data}>
      <Outlet />
    </IdentidadContext>
  )
}
