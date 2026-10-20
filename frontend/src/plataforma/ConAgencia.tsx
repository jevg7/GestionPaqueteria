import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { ApiError, mensajeDeError } from '../lib/api.ts'
import { opcionesAgencia, type Agencia } from './agencias.ts'

/** Carga la agencia de la ruta (:id) con su espera, su error o su "no existe"; con la agencia, dibuja children. */
export function ConAgencia({ volver, children }: { volver: string; children: (agencia: Agencia) => ReactNode }) {
  const id = Number(useParams().id)
  const valido = Number.isSafeInteger(id) && id > 0
  const consulta = useQuery({ ...opcionesAgencia(id), enabled: valido })

  if (!valido || (consulta.error instanceof ApiError && consulta.error.status === 404)) {
    return (
      <section>
        <h1 className="text-xl font-semibold">La agencia no existe</h1>
        <Link to={volver} className="mt-2 inline-block text-sm font-medium text-blue-700 hover:underline">
          Volver a las agencias
        </Link>
      </section>
    )
  }
  if (consulta.isPending) return <p className="text-sm text-slate-500">Cargando la agencia…</p>
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
