import type { ReactNode } from 'react'
import { Aviso } from './Aviso.tsx'
import { Boton } from './Boton.tsx'
import type { VarianteBoton } from './estilos.ts'

type Props = {
  /** Qué va a pasar y sus consecuencias, en palabras del usuario. */
  mensaje: ReactNode
  textoConfirmar: string
  variante?: VarianteBoton
  cargando: boolean
  error?: string
  alConfirmar: () => void
  alCancelar: () => void
}

/** Confirmación dentro de la página (en lugar de un diálogo) para acciones que cambian el acceso o los datos. */
export function Confirmacion({ mensaje, textoConfirmar, variante = 'primario', cargando, error, alConfirmar, alCancelar }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-700">{mensaje}</p>
      {error && (
        <div className="mt-3">
          <Aviso tipo="error">{error}</Aviso>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        <Boton variante={variante} cargando={cargando} onClick={alConfirmar}>
          {textoConfirmar}
        </Boton>
        <Boton variante="secundario" disabled={cargando} onClick={alCancelar}>
          Cancelar
        </Boton>
      </div>
    </div>
  )
}
