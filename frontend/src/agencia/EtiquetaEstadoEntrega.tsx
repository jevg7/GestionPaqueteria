import { Etiqueta, type Tono } from '../components/Etiqueta.tsx'
import { estadosDeEntregaVisibles, type EstadoEntrega } from './entregas.ts'

export function EtiquetaEstadoEntrega({ estado }: { estado: EstadoEntrega }) {
  // Un estado que la interfaz no conoce (si el backend agregara uno) se muestra con su código.
  const visible: { nombre: string; tono: Tono } = estadosDeEntregaVisibles[estado] ?? { nombre: estado, tono: 'gris' }
  return <Etiqueta tono={visible.tono}>{visible.nombre}</Etiqueta>
}
