import { Etiqueta, type Tono } from '../components/Etiqueta.tsx'
import { estadosDePagoVisibles, type EstadoDePago } from './facturas.ts'

export function EtiquetaEstadoDePago({ estado }: { estado: EstadoDePago }) {
  // Un estado que la interfaz no conoce (si el backend agregara uno) se muestra con su código.
  const visible: { nombre: string; tono: Tono } = estadosDePagoVisibles[estado] ?? { nombre: estado, tono: 'gris' }
  return <Etiqueta tono={visible.tono}>{visible.nombre}</Etiqueta>
}
