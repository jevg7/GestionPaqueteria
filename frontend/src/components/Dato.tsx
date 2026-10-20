import type { ReactNode } from 'react'

/** Un dato de una ficha de detalle: su nombre arriba y el valor (o "—" si no hay). */
export function Dato({ nombre, valor, ancho = false }: { nombre: string; valor: ReactNode; ancho?: boolean }) {
  return (
    <div className={ancho ? 'sm:col-span-2' : undefined}>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{nombre}</dt>
      <dd className="mt-1 break-words text-sm">{valor ?? '—'}</dd>
    </div>
  )
}
