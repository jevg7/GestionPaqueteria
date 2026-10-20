import { useId, type ComponentProps } from 'react'

type Props = ComponentProps<'input'> & { etiqueta: string; error?: string }

/** Campo de texto con su etiqueta y su mensaje de error; recibe directamente register() de React Hook Form. */
export function Campo({ etiqueta, error, id, ...props }: Props) {
  const generado = useId()
  const idCampo = id ?? generado
  const idError = `${idCampo}-error`
  return (
    <div>
      <label htmlFor={idCampo} className="block text-sm font-medium text-slate-700">
        {etiqueta}
      </label>
      <input
        id={idCampo}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? idError : undefined}
        className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-xs focus:border-blue-700 focus:outline-2 focus:outline-blue-700/20 aria-invalid:border-red-600"
        {...props}
      />
      {error && (
        <p id={idError} className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
