import { useQuery } from '@tanstack/react-query'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { mensajeDeError } from '../lib/errores.ts'
import { formatearFechaHora } from '../lib/formato.ts'
import { opcionesHistorialPaquete } from './paquetes.ts'

/**
 * La línea de tiempo del paquete: cada cambio de estado con su fecha, quién lo hizo y su observación. Va en el orden en
 * que se registraron (el de la API): una salida registrada con fecha pasada no aparece antes de su asignación.
 */
export function HistorialPaquete({ id }: { id: number }) {
  const historial = useQuery(opcionesHistorialPaquete(id))

  return (
    <section aria-labelledby="titulo-historial" className="mt-8">
      <h2 id="titulo-historial" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Historial
      </h2>
      {historial.isPending ? (
        <p className="mt-2 text-sm text-slate-500">Cargando historial…</p>
      ) : historial.isError ? (
        <div className="mt-2 space-y-3">
          <Aviso tipo="error">{mensajeDeError(historial.error)}</Aviso>
          <Boton variante="secundario" cargando={historial.isFetching} onClick={() => void historial.refetch()}>
            Reintentar
          </Boton>
        </div>
      ) : (
        <ol className="mt-3">
          {historial.data.map((entrada, indice) => {
            const ultima = indice === historial.data.length - 1
            return (
              <li key={entrada.id} className="relative flex gap-3 pb-5 last:pb-0">
                {!ultima && <span aria-hidden="true" className="absolute top-4 left-[5px] h-full w-px bg-slate-300" />}
                <span
                  aria-hidden="true"
                  className={`relative mt-1.5 size-[11px] shrink-0 rounded-full ring-4 ring-slate-50 ${ultima ? 'bg-blue-700' : 'bg-slate-400'}`}
                />
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">{entrada.estado.nombre}</span>
                    <span className="text-slate-500"> · {formatearFechaHora(entrada.fecha)}</span>
                  </p>
                  <p className="text-sm text-slate-500">{entrada.usuario}</p>
                  {entrada.observacion && <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{entrada.observacion}</p>}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
