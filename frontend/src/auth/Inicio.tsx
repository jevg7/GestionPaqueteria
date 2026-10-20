import { Navigate } from 'react-router'
import { BotonCerrarSesion } from '../components/BotonCerrarSesion.tsx'
import { PantallaCentrada } from '../components/PantallaCentrada.tsx'
import { useIdentidadActual } from './identidad.ts'
import { destinoInicial } from './secciones.ts'

/** La raíz (/) lleva a cada quien a su panel: la plataforma o la primera sección que sus roles permiten. */
export function Inicio() {
  const identidad = useIdentidadActual()
  const destino = destinoInicial(identidad)
  if (destino) return <Navigate to={destino} replace />
  return (
    <PantallaCentrada titulo="Sin permisos">
      <p className="text-sm text-slate-600">
        Su usuario no tiene roles activos. Consulte con el administrador de su agencia.
      </p>
      <div className="mt-6">
        <BotonCerrarSesion />
      </div>
    </PantallaCentrada>
  )
}
