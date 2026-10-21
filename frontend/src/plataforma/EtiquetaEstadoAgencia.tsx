import { Etiqueta } from '../components/Etiqueta.tsx'
import type { EstadoAgencia } from './agencias.ts'

export function EtiquetaEstadoAgencia({ estado }: { estado: EstadoAgencia }) {
  return estado === 'ACTIVA' ? <Etiqueta tono="verde">Activa</Etiqueta> : <Etiqueta tono="ambar">Suspendida</Etiqueta>
}
