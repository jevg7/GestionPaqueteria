import { Etiqueta } from '../components/Etiqueta.tsx'
import { tonosDeEstado, type Paquete } from './paquetes.ts'

/** El estado de un paquete con el nombre del catálogo ("Recibido en Miami"). */
export function EtiquetaEstadoPaquete({ estado }: { estado: Paquete['estado'] }) {
  return <Etiqueta tono={tonosDeEstado[estado.codigo] ?? 'gris'}>{estado.nombre}</Etiqueta>
}
