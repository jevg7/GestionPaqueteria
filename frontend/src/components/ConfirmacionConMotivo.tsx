import { zodResolver } from '@hookform/resolvers/zod'
import { useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { mensajeDelEnvio } from '../lib/formularios.ts'
import type { DatosMotivo, esquemaDeMotivo } from '../lib/validacion.ts'
import { AreaDeTexto } from './AreaDeTexto.tsx'
import { Aviso } from './Aviso.tsx'
import { Boton } from './Boton.tsx'
import type { VarianteBoton } from './estilos.ts'

type Props = {
  /** Qué va a pasar y sus consecuencias. */
  mensaje: ReactNode
  /** El de la regla de la API (cada DTO tiene su mensaje de "motivo obligatorio"). */
  esquema: ReturnType<typeof esquemaDeMotivo>
  textoConfirmar: string
  variante?: VarianteBoton
  /** Llama a la API; si falla, el error (p. ej. un 409 con su motivo) se muestra aquí. */
  alConfirmar: (motivo: string) => Promise<void>
  alVolver: () => void
}

/** Confirmación en la página para anular, cancelar o marcar fallido: pide el motivo, que queda registrado. */
export function ConfirmacionConMotivo({ mensaje, esquema, textoConfirmar, variante = 'peligro', alConfirmar, alVolver }: Props) {
  const [errorGeneral, setErrorGeneral] = useState<string>()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DatosMotivo>({ resolver: zodResolver(esquema), defaultValues: { motivo: '' } })

  const confirmar = async ({ motivo }: DatosMotivo) => {
    setErrorGeneral(undefined)
    try {
      await alConfirmar(motivo)
    } catch (error) {
      setErrorGeneral(mensajeDelEnvio(error, setError, ['motivo']))
    }
  }

  return (
    <form onSubmit={handleSubmit(confirmar)} noValidate className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-700">{mensaje}</p>
      <AreaDeTexto etiqueta="Motivo" rows={2} error={errors.motivo?.message} {...register('motivo')} />
      {errorGeneral && <Aviso tipo="error">{errorGeneral}</Aviso>}
      <div className="flex flex-wrap gap-3">
        <Boton type="submit" variante={variante} cargando={isSubmitting}>
          {textoConfirmar}
        </Boton>
        <Boton variante="secundario" disabled={isSubmitting} onClick={alVolver}>
          Volver
        </Boton>
      </div>
    </form>
  )
}
