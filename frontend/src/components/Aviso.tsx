import type { ReactNode } from 'react'

const estilos = {
  exito: 'border-green-200 bg-green-50 text-green-800',
  error: 'border-red-200 bg-red-50 text-red-800',
  advertencia: 'border-amber-200 bg-amber-50 text-amber-900',
}

/** Mensaje destacado: el resultado de una acción o un error que el usuario debe ver. */
export function Aviso({ tipo, children }: { tipo: keyof typeof estilos; children: ReactNode }) {
  return (
    <div role={tipo === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-3 py-2 text-sm ${estilos[tipo]}`}>
      {children}
    </div>
  )
}
