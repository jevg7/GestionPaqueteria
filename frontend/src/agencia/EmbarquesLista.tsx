import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router'
import { usePermiso } from '../auth/identidad.ts'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { EnlaceBoton } from '../components/EnlaceBoton.tsx'
import { Paginacion } from '../components/Paginacion.tsx'
import { campoDeFiltro } from '../components/estilos.ts'
import { mensajeDeError } from '../lib/errores.ts'
import { useDiferido } from '../lib/useDiferido.ts'
import { useFiltrosDeLista } from '../lib/useFiltrosDeLista.ts'
import { opcionesCatalogos } from './catalogos.ts'
import {
  estadosDeEmbarque,
  estadosDeEmbarqueVisibles,
  opcionesListaEmbarques,
  resumenDeFechas,
  TAMANO_DE_PAGINA,
  textoDePaquetes,
} from './embarques.ts'
import { EtiquetaEstadoEmbarque } from './EtiquetaEstadoEmbarque.tsx'

/** Embarques, los más recientes primero: consultan ADMIN, AGENTE y BODEGA; los operan ADMIN y BODEGA. */
export function EmbarquesLista() {
  const opera = usePermiso('OperarBodega')
  const { leer, pagina, cambiar, cambiarPagina } = useFiltrosDeLista()
  const ubicacion = useLocation()
  const catalogos = useQuery(opcionesCatalogos)
  const buscar = leer('buscar')
  const estado = estadosDeEmbarque.find((codigo) => codigo === leer('estado')) ?? ''
  const metodo = leer('metodo')
  const buscarDiferido = useDiferido(buscar.trim())
  const lista = useQuery(opcionesListaEmbarques({ buscar: buscarDiferido, estado, metodo, pagina }))

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Embarques</h1>
        {opera && <EnlaceBoton to="nuevo">Nuevo embarque</EnlaceBoton>}
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          value={buscar}
          onChange={(evento) => cambiar('buscar', evento.target.value)}
          placeholder="Buscar por código (AIR-2026-0001)"
          aria-label="Buscar embarques"
          maxLength={30}
          className={`${campoDeFiltro} w-full sm:max-w-xs`}
        />
        <select value={estado} onChange={(evento) => cambiar('estado', evento.target.value)} aria-label="Estado" className={campoDeFiltro}>
          <option value="">Todos los estados</option>
          {estadosDeEmbarque.map((codigo) => (
            <option key={codigo} value={codigo}>
              {estadosDeEmbarqueVisibles[codigo].nombre}
            </option>
          ))}
        </select>
        <select value={metodo} onChange={(evento) => cambiar('metodo', evento.target.value)} aria-label="Método de envío" className={campoDeFiltro}>
          <option value="">Todos los métodos</option>
          {catalogos.data?.metodosEnvio.map((opcion) => (
            <option key={opcion.codigo} value={opcion.codigo}>
              {opcion.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4">
        {lista.isPending ? (
          <p className="text-sm text-slate-500">Cargando embarques…</p>
        ) : lista.isError ? (
          <div className="space-y-3">
            <Aviso tipo="error">{mensajeDeError(lista.error)}</Aviso>
            <Boton variante="secundario" cargando={lista.isFetching} onClick={() => void lista.refetch()}>
              Reintentar
            </Boton>
          </div>
        ) : lista.data.total === 0 ? (
          <p className="text-sm text-slate-600">
            {buscarDiferido || estado || metodo ? 'Ningún embarque coincide con la búsqueda.' : 'Todavía no hay embarques.'}
          </p>
        ) : (
          <div className={`space-y-3 ${lista.isPlaceholderData ? 'opacity-60' : ''}`}>
            {lista.data.items.length > 0 && (
              <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                {lista.data.items.map((embarque) => (
                  <li key={embarque.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={String(embarque.id)}
                          state={{ lista: ubicacion.search }}
                          className="font-mono font-medium text-blue-800 hover:underline"
                        >
                          {embarque.codigoEmbarque}
                        </Link>
                        <EtiquetaEstadoEmbarque estado={embarque.estado} />
                      </div>
                      <span className="text-sm text-slate-600">{embarque.metodoEnvio.nombre}</span>
                    </div>
                    <p className="mt-1 text-sm">
                      {embarque.ruta.nombre} · {textoDePaquetes(embarque.cantidadPaquetes)}
                    </p>
                    <p className="text-sm text-slate-500">{resumenDeFechas(embarque)}</p>
                  </li>
                ))}
              </ul>
            )}
            <Paginacion pagina={pagina} tamano={TAMANO_DE_PAGINA} total={lista.data.total} alCambiar={cambiarPagina} />
          </div>
        )}
      </div>
    </section>
  )
}
