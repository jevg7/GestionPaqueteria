import type { ComponentProps } from 'react'
import { baseBoton, variantesBoton, type VarianteBoton } from './estilos.ts'

type Props = ComponentProps<'button'> & {
  variante?: VarianteBoton
  /** Muestra el indicador de espera y deshabilita el botón. */
  cargando?: boolean
}

export function Boton({ variante = 'primario', cargando = false, disabled, className = '', children, ...props }: Props) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      className={`${baseBoton} ${variantesBoton[variante]} ${className}`}
    >
      {cargando && (
        <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
      )}
      {children}
    </button>
  )
}
