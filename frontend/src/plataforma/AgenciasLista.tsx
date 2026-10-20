import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useSearchParams } from 'react-router'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { EnlaceBoton } from '../components/EnlaceBoton.tsx'
import { Paginacion } from '../components/Paginacion.tsx'
import { mensajeDeError } from '../lib/api.ts'
import { useDiferido } from '../lib/useDiferido.ts'
import { opcionesListaAgencias, TAMANO_DE_PAGINA, type EstadoAgencia } from './agencias.ts'
import { EtiquetaEstadoAgencia } from './EtiquetaEstadoAgencia.tsx'

const estados: { valor: EstadoAgencia | ''; texto: string }[] = [
  { valor: '', texto: 'Todas' },
  { valor: 'ACTIVA', texto: 'Activas' },
  { valor: 'SUSPENDIDA', texto: 'Suspendidas' },
]

const campo =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-xs focus:border-blue-700 focus:outline-2 focus:outline-blue-700/20'

export function AgenciasLista() {
  const [parametros, setParametros] = useSearchParams()
  const ubicacion = useLocation()
  const buscar = parametros.get('buscar') ?? ''
  const estado = estados.find((opcion) => opcion.valor === parametros.get('estado'))?.valor ?? ''
  const pagina = Math.max(1, Number.parseInt(parametros.get('pagina') ?? '', 10) || 1)
  // El cuadro de búsqueda responde al instante; la consulta sale cuando se deja de escribir.
  const buscarDiferido = useDiferido(buscar.trim())
  const lista = useQuery(opcionesListaAgencias({ buscar: buscarDiferido, estado, pagina }))

  // Los filtros viven en la dirección: sobreviven a una recarga y a volver desde el detalle.
  const cambiar = (nombre: 'buscar' | 'estado' | 'pagina', valor: string) =>
    setParametros(
      (actuales) => {
        const nuevos = new URLSearchParams(actuales)
        if (valor) nuevos.set(nombre, valor)
        else nuevos.delete(nombre)
        // Con otro filtro la lista es otra: se vuelve a la primera página.
        if (nombre !== 'pagina') nuevos.delete('pagina')
        return nuevos
      },
      { replace: true },
    )

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Agencias</h1>
        <EnlaceBoton to="nueva">Nueva agencia</EnlaceBoton>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          value={buscar}
          onChange={(evento) => cambiar('buscar', evento.target.value)}
          placeholder="Buscar por nombre, RUC o correo"
          aria-label="Buscar agencias"
          maxLength={100}
          className={`${campo} w-full sm:max-w-sm`}
        />
        <select value={estado} onChange={(evento) => cambiar('estado', evento.target.value)} aria-label="Estado" className={campo}>
          {estados.map((opcion) => (
            <option key={opcion.valor} value={opcion.valor}>
              {opcion.texto}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4">
        {lista.isPending ? (
          <p className="text-sm text-slate-500">Cargando agencias…</p>
        ) : lista.isError ? (
          <div className="space-y-3">
            <Aviso tipo="error">{mensajeDeError(lista.error)}</Aviso>
            <Boton variante="secundario" cargando={lista.isFetching} onClick={() => void lista.refetch()}>
              Reintentar
            </Boton>
          </div>
        ) : lista.data.total === 0 ? (
          <p className="text-sm text-slate-600">
            {buscarDiferido || estado ? 'Ninguna agencia coincide con la búsqueda.' : 'Todavía no hay agencias.'}
          </p>
        ) : (
          <div className={`space-y-3 ${lista.isPlaceholderData ? 'opacity-60' : ''}`}>
            {lista.data.items.length > 0 && (
              <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                {lista.data.items.map((agencia) => (
                  <li key={agencia.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        to={String(agencia.id)}
                        state={{ lista: ubicacion.search }}
                        className="font-medium text-blue-800 hover:underline"
                      >
                        {agencia.nombre}
                      </Link>
                      <p className="truncate text-sm text-slate-500">
                        {[agencia.ruc && `RUC ${agencia.ruc}`, agencia.correoContacto, agencia.telefono]
                          .filter(Boolean)
                          .join(' · ') || 'Sin datos de contacto'}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <EtiquetaEstadoAgencia estado={agencia.estado} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Paginacion
              pagina={pagina}
              tamano={TAMANO_DE_PAGINA}
              total={lista.data.total}
              alCambiar={(nueva) => cambiar('pagina', nueva === 1 ? '' : String(nueva))}
            />
          </div>
        )}
      </div>
    </section>
  )
}
