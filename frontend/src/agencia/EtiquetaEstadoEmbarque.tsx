import { Etiqueta, type Tono } from '../components/Etiqueta.tsx'
import { estadosDeEmbarqueVisibles, type EstadoEmbarque } from './embarques.ts'

export function EtiquetaEstadoEmbarque({ estado }: { estado: EstadoEmbarque }) {
  // Un estado que la interfaz no conoce (si el backend agregara uno) se muestra con su código.
  const visible: { nombre: string; tono: Tono } = estadosDeEmbarqueVisibles[estado] ?? { nombre: estado, tono: 'gris' }
  return <Etiqueta tono={visible.tono}>{visible.nombre}</Etiqueta>
}
