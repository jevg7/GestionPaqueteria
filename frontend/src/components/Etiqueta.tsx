import type { ReactNode } from 'react'

const tonos = {
  verde: 'bg-green-100 text-green-800',
  ambar: 'bg-amber-100 text-amber-900',
  azul: 'bg-blue-100 text-blue-800',
  gris: 'bg-slate-100 text-slate-700',
}

export type Tono = keyof typeof tonos

/** Etiqueta pequeña para estados y roles ("Activa", "Vigente", "Administrador"…). */
export function Etiqueta({ tono, children }: { tono: Tono; children: ReactNode }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${tonos[tono]}`}>{children}</span>
}
