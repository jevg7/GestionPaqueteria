import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ApiError, mensajeDeError } from '../lib/errores.ts'
import { Aviso } from './Aviso.tsx'
import { Boton } from './Boton.tsx'

type Props<T> = {
  consulta: UseQueryResult<T>
  /** False si el id de la ruta no es válido: se muestra "no existe" sin consultar. */
  idValido: boolean
  noExiste: { titulo: string; volver: string; textoVolver: string }
  children: (registro: T) => ReactNode
}

/** Espera, error o "no existe" de un registro que se abre por su id; con el registro, dibuja children. */
export function CargaDeRegistro<T>({ consulta, idValido, noExiste, children }: Props<T>) {
  if (!idValido || (consulta.error instanceof ApiError && consulta.error.status === 404)) {
    return (
      <section>
        <h1 className="text-xl font-semibold">{noExiste.titulo}</h1>
        <Link to={noExiste.volver} className="mt-2 inline-block text-sm font-medium text-blue-700 hover:underline">
          {noExiste.textoVolver}
        </Link>
      </section>
    )
  }
  if (consulta.isPending) return <p className="text-sm text-slate-500">Cargando…</p>
  if (consulta.isError) {
    return (
      <div className="space-y-3">
        <Aviso tipo="error">{mensajeDeError(consulta.error)}</Aviso>
        <Boton variante="secundario" cargando={consulta.isFetching} onClick={() => void consulta.refetch()}>
          Reintentar
        </Boton>
      </div>
    )
  }
  return children(consulta.data)
}
