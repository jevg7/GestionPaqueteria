import { usePrefetchQuery } from '@tanstack/react-query'
import { Navigate, NavLink, Outlet } from 'react-router'
import { nombreCompleto, nombresDeRol, useIdentidadActual, type Identidad } from '../auth/identidad.ts'
import { seccionesVisibles } from '../auth/secciones.ts'
import { MenuUsuario } from '../components/MenuUsuario.tsx'
import { opcionesCatalogos } from './catalogos.ts'

/** Marco de las secciones de una agencia: menú según los roles del empleado. */
export function PanelAgencia() {
  const identidad = useIdentidadActual()
  if (identidad.tipo !== 'AGENCIA' || !identidad.agencia) return <Navigate to="/" replace />
  return <Panel identidad={identidad} agencia={identidad.agencia} />
}

function Panel({ identidad, agencia }: { identidad: Identidad; agencia: NonNullable<Identidad['agencia']> }) {
  // Los formularios de la agencia usan los catálogos: se piden desde que el empleado entra.
  usePrefetchQuery(opcionesCatalogos)
  const secciones = seccionesVisibles(identidad.roles)

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{agencia.nombre}</p>
            <p className="text-xs text-slate-500">Gestión de Paquetería</p>
          </div>
          <MenuUsuario
            nombre={nombreCompleto(identidad)}
            detalle={identidad.roles.map((rol) => nombresDeRol[rol]).join(' · ')}
          />
        </div>
      </header>
      <div className="flex-1 md:flex">
        <nav
          aria-label="Secciones"
          className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white p-2 md:w-56 md:shrink-0 md:flex-col md:overflow-visible md:border-r md:border-b-0"
        >
          {secciones.map((seccion) => (
            <NavLink
              key={seccion.ruta}
              to={`/${seccion.ruta}`}
              className={({ isActive }) =>
                `shrink-0 rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-blue-50 font-medium text-blue-800' : 'text-slate-700 hover:bg-slate-100'}`
              }
            >
              {seccion.titulo}
            </NavLink>
          ))}
        </nav>
        <main className="min-w-0 flex-1 px-4 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
