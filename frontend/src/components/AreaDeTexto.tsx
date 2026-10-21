import { useId, type ComponentProps } from 'react'

type Props = ComponentProps<'textarea'> & {
  etiqueta: string
  error?: string
  /** Aclaración bajo el campo (se oculta mientras hay un error). */
  ayuda?: string
}

/** Texto de varias líneas (dirección, descripción, motivo) con su etiqueta y su error; recibe register(). */
export function AreaDeTexto({ etiqueta, error, ayuda, id, rows = 3, ...props }: Props) {
  const generado = useId()
  const idCampo = id ?? generado
  const idNota = `${idCampo}-nota`
  const nota = error ?? ayuda
  return (
    <div>
      <label htmlFor={idCampo} className="block text-sm font-medium text-slate-700">
        {etiqueta}
      </label>
      <textarea
        id={idCampo}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={nota ? idNota : undefined}
        className="mt-1 block w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-xs focus:border-blue-700 focus:outline-2 focus:outline-blue-700/20 aria-invalid:border-red-600"
        {...props}
      />
      {nota && (
        <p id={idNota} className={`mt-1 text-sm ${error ? 'text-red-700' : 'text-slate-500'}`}>
          {nota}
        </p>
      )}
    </div>
  )
}
