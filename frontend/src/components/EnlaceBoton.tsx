import { Link, type LinkProps } from 'react-router'
import { baseBoton, variantesBoton, type VarianteBoton } from './estilos.ts'

/** Enlace con aspecto de botón (por ejemplo, "Nueva agencia"). */
export function EnlaceBoton({ variante = 'primario', className = '', ...props }: LinkProps & { variante?: VarianteBoton }) {
  return <Link {...props} className={`${baseBoton} ${variantesBoton[variante]} ${className}`} />
}
