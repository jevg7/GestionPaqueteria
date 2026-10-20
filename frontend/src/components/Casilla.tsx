import { useId, type ComponentProps } from 'react'

type Props = ComponentProps<'input'> & { etiqueta: string; descripcion?: string | null }

/** Casilla de verificación con su texto y una descripción opcional (por ejemplo, un rol y lo que permite). */
export function Casilla({ etiqueta, descripcion, id, ...props }: Props) {
  const generado = useId()
  const idCasilla = id ?? generado
  return (
    <label
      htmlFor={idCasilla}
      className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 bg-white p-3 has-checked:border-blue-300 has-checked:bg-blue-50 has-disabled:cursor-not-allowed has-disabled:opacity-70"
    >
      <input id={idCasilla} type="checkbox" className="mt-0.5 size-4 accent-blue-700" {...props} />
      <span>
        <span className="block text-sm font-medium">{etiqueta}</span>
        {descripcion && <span className="block text-xs text-slate-500">{descripcion}</span>}
      </span>
    </label>
  )
}
