import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { Confirmacion } from '../components/Confirmacion.tsx'
import { mensajeDeError } from '../lib/errores.ts'
import { nombreDelCliente } from './clientes.ts'
import { opcionesPaquetesDelEmbarque, quitarPaquete, type Embarque } from './embarques.ts'
import { EtiquetaEstadoPaquete } from './EtiquetaEstadoPaquete.tsx'
import type { Paquete } from './paquetes.ts'

type Props = {
  embarque: Embarque
  /** Si se ofrece quitar paquetes: embarque ABIERTO y quien puede operarlo. */
  puedeQuitar: boolean
  alQuitar: (actualizado: Embarque, aviso: string) => void
}

/** Los paquetes del embarque. Mientras está abierto se pueden quitar: vuelven a la bodega como Recibido en Miami. */
export function PaquetesDelEmbarque({ embarque, puedeQuitar, alQuitar }: Props) {
  const paquetes = useQuery(opcionesPaquetesDelEmbarque(embarque.id))
  const [quitando, setQuitando] = useState<number>()
  const quita = useMutation({
    mutationFn: (paquete: Paquete) => quitarPaquete(embarque.id, paquete.id),
    onSuccess: (actualizado, paquete) => {
      setQuitando(undefined)
      alQuitar(actualizado, `${paquete.codigoPaquete} quitado del embarque: volvió a Recibido en Miami.`)
    },
  })

  return (
    <section aria-labelledby="titulo-paquetes-del-embarque" className="mt-8">
      <h2 id="titulo-paquetes-del-embarque" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Paquetes ({embarque.cantidadPaquetes})
      </h2>
      {paquetes.isPending ? (
        <p className="mt-2 text-sm text-slate-500">Cargando paquetes…</p>
      ) : paquetes.isError ? (
        <div className="mt-2 space-y-3">
          <Aviso tipo="error">{mensajeDeError(paquetes.error)}</Aviso>
          <Boton variante="secundario" cargando={paquetes.isFetching} onClick={() => void paquetes.refetch()}>
            Reintentar
          </Boton>
        </div>
      ) : paquetes.data.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">El embarque no tiene paquetes.</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {paquetes.data.map((paquete) => (
            <li key={paquete.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/paquetes/${paquete.id}`} className="font-mono font-medium text-blue-800 hover:underline">
                      {paquete.codigoPaquete}
                    </Link>
                    <EtiquetaEstadoPaquete estado={paquete.estado} />
                  </div>
                  <p className="truncate text-sm text-slate-600">
                    {paquete.descripcion} · {nombreDelCliente(paquete.cliente)}
                  </p>
                </div>
                {puedeQuitar && quitando !== paquete.id && (
                  <Boton
                    variante="secundario"
                    onClick={() => {
                      quita.reset()
                      setQuitando(paquete.id)
                    }}
                  >
                    Quitar
                  </Boton>
                )}
              </div>
              {quitando === paquete.id && (
                <div className="mt-3">
                  <Confirmacion
                    mensaje={`¿Quitar ${paquete.codigoPaquete} del embarque? Vuelve a la bodega como Recibido en Miami y se puede asignar de nuevo.`}
                    textoConfirmar="Sí, quitar"
                    cargando={quita.isPending}
                    error={quita.isError ? mensajeDeError(quita.error) : undefined}
                    alConfirmar={() => quita.mutate(paquete)}
                    alCancelar={() => setQuitando(undefined)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
