import type { ComponentProps } from 'react'

type Props = ComponentProps<'button'> & {
  variante?: 'primario' | 'secundario'
  /** Muestra el indicador de espera y deshabilita el botón. */
  cargando?: boolean
}

const estilos = {
  primario: 'bg-blue-700 text-white hover:bg-blue-800 disabled:bg-blue-400',
  secundario: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:text-slate-400',
}

export function Boton({ variante = 'primario', cargando = false, disabled, className = '', children, ...props }: Props) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed ${estilos[variante]} ${className}`}
    >
      {cargando && (
        <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
      )}
      {children}
    </button>
  )
}
