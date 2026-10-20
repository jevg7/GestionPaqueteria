import { Navigate, Outlet } from 'react-router'
import { nombreCompleto, nombresDeRol, useIdentidadActual } from '../auth/identidad.ts'
import { MenuUsuario } from '../components/MenuUsuario.tsx'

/** Marco del panel de los dueños de la plataforma (administran las agencias, no ven sus datos). */
export function PanelPlataforma() {
  const identidad = useIdentidadActual()
  if (identidad.tipo !== 'PLATAFORMA') return <Navigate to="/" replace />

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Gestión de Paquetería</p>
            <p className="text-xs text-slate-500">Panel de la plataforma</p>
          </div>
          <MenuUsuario nombre={nombreCompleto(identidad)} detalle={nombresDeRol.PLATAFORMA} />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
