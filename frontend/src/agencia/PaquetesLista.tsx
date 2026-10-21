import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router'
import { usePermiso } from '../auth/identidad.ts'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { EnlaceBoton } from '../components/EnlaceBoton.tsx'
import { Paginacion } from '../components/Paginacion.tsx'
import { campoDeFiltro } from '../components/estilos.ts'
import { mensajeDeError } from '../lib/errores.ts'
import { formatearFecha } from '../lib/formato.ts'
import { useDiferido } from '../lib/useDiferido.ts'
import { useFiltrosDeLista } from '../lib/useFiltrosDeLista.ts'
import { opcionesCatalogos } from './catalogos.ts'
import { nombreDelCliente, opcionesCliente } from './clientes.ts'
import { EtiquetaEstadoPaquete } from './EtiquetaEstadoPaquete.tsx'
import { estadosDePaquete, opcionesListaPaquetes, TAMANO_DE_PAGINA } from './paquetes.ts'

/** Paquetes de la agencia, los más recientes primero: consultan ADMIN, AGENTE y BODEGA; registran ADMIN y AGENTE. */
export function PaquetesLista() {
  const puedeRegistrar = usePermiso('GestionarPaquetes')
  const { leer, pagina, cambiar, cambiarPagina } = useFiltrosDeLista()
  const ubicacion = useLocation()
  const catalogos = useQuery(opcionesCatalogos)
  const buscar = leer('buscar')
  const estado = estadosDePaquete.find((codigo) => codigo === leer('estado')) ?? ''
  const metodo = leer('metodo')
  // El filtro por cliente llega desde su ficha ("Ver sus paquetes").
  const idCliente = Number(leer('cliente'))
  const clienteId = Number.isSafeInteger(idCliente) && idCliente > 0 ? idCliente : null
  const buscarDiferido = useDiferido(buscar.trim())
  const lista = useQuery(opcionesListaPaquetes({ buscar: buscarDiferido, estado, clienteId, metodo, pagina }))

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Paquetes</h1>
        {puedeRegistrar && (
          <EnlaceBoton to={clienteId ? `nuevo?cliente=${clienteId}` : 'nuevo'}>Registrar paquete</EnlaceBoton>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-3 lg:flex-row">
        <input
          type="search"
          value={buscar}
          onChange={(evento) => cambiar('buscar', evento.target.value)}
          placeholder="Buscar por código, tracking o descripción"
          aria-label="Buscar paquetes"
          maxLength={100}
          className={`${campoDeFiltro} w-full lg:max-w-md`}
        />
        <div className="flex flex-col gap-3 sm:flex-row">
          <select value={estado} onChange={(evento) => cambiar('estado', evento.target.value)} aria-label="Estado" className={campoDeFiltro}>
            <option value="">Todos los estados</option>
            {catalogos.data?.estadosPaquete.map((opcion) => (
              <option key={opcion.codigo} value={opcion.codigo}>
                {opcion.nombre}
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
      </div>
      {clienteId && <FiltroDeCliente id={clienteId} alQuitar={() => cambiar('cliente', '')} />}

      <div className="mt-4">
        {lista.isPending ? (
          <p className="text-sm text-slate-500">Cargando paquetes…</p>
        ) : lista.isError ? (
          <div className="space-y-3">
            <Aviso tipo="error">{mensajeDeError(lista.error)}</Aviso>
            <Boton variante="secundario" cargando={lista.isFetching} onClick={() => void lista.refetch()}>
              Reintentar
            </Boton>
          </div>
        ) : lista.data.total === 0 ? (
          <p className="text-sm text-slate-600">
            {buscarDiferido || estado || metodo || clienteId ? 'Ningún paquete coincide con la búsqueda.' : 'Todavía no hay paquetes registrados.'}
          </p>
        ) : (
          <div className={`space-y-3 ${lista.isPlaceholderData ? 'opacity-60' : ''}`}>
            {lista.data.items.length > 0 && (
              <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                {lista.data.items.map((paquete) => (
                  <li key={paquete.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={String(paquete.id)}
                          state={{ lista: ubicacion.search }}
                          className="font-mono font-medium text-blue-800 hover:underline"
                        >
                          {paquete.codigoPaquete}
                        </Link>
                        <EtiquetaEstadoPaquete estado={paquete.estado} />
                      </div>
                      <span className="text-sm text-slate-600">{paquete.metodoEnvio.nombre}</span>
                    </div>
                    <p className="mt-1 truncate text-sm">{paquete.descripcion}</p>
                    <p className="truncate text-sm text-slate-500">
                      {nombreDelCliente(paquete.cliente)} ({paquete.cliente.codigoCliente})
                      {paquete.trackingExterno && ` · Tracking ${paquete.trackingExterno}`} · Registrado el{' '}
                      {formatearFecha(paquete.fechaRegistro)}
                    </p>
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

/** "Paquetes de: María José Pérez (CLI-000001)", con el botón para quitar el filtro. */
function FiltroDeCliente({ id, alQuitar }: { id: number; alQuitar: () => void }) {
  const cliente = useQuery(opcionesCliente(id))
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-slate-600">Paquetes de:</span>
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 py-1 pr-1 pl-3 font-medium text-blue-800">
        {cliente.data ? `${nombreDelCliente(cliente.data)} (${cliente.data.codigoCliente})` : `cliente ${id}`}
        <button
          type="button"
          onClick={alQuitar}
          aria-label="Quitar el filtro por cliente"
          className="grid size-6 place-items-center rounded-full hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-blue-700"
        >
          ×
        </button>
      </span>
    </div>
  )
}
