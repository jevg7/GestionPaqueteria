import type { EstadoAgencia } from './agencias.ts'

export function EtiquetaEstadoAgencia({ estado }: { estado: EstadoAgencia }) {
  return estado === 'ACTIVA' ? (
    <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">Activa</span>
  ) : (
    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">Suspendida</span>
  )
}
