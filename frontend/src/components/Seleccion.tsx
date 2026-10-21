import { useId, type ComponentProps } from 'react'

type Props = ComponentProps<'select'> & { etiqueta: string; error?: string }

/** Lista desplegable con su etiqueta y su error; recibe directamente register() de React Hook Form. */
export function Seleccion({ etiqueta, error, id, children, ...props }: Props) {
  const generado = useId()
  const idCampo = id ?? generado
  return (
    <div>
      <label htmlFor={idCampo} className="block text-sm font-medium text-slate-700">
        {etiqueta}
      </label>
      <select
        id={idCampo}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${idCampo}-nota` : undefined}
        className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-xs focus:border-blue-700 focus:outline-2 focus:outline-blue-700/20 aria-invalid:border-red-600"
        {...props}
      >
        {children}
      </select>
      {error && (
        <p id={`${idCampo}-nota`} className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
