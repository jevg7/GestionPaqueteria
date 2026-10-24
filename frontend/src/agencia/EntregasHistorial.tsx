import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { Paginacion } from '../components/Paginacion.tsx'
import { campoDeFiltro } from '../components/estilos.ts'
import { mensajeDeError } from '../lib/errores.ts'
import { formatearFechaHora } from '../lib/formato.ts'
import { useFiltrosDeLista } from '../lib/useFiltrosDeLista.ts'
import { nombreDelCliente } from './clientes.ts'
import {
  estadosDeEntrega,
  estadosDeEntregaVisibles,
  nombresDeTipoDeEntrega,
  opcionesListaEntregas,
  TAMANO_DE_PAGINA,
  tiposDeEntrega,
} from './entregas.ts'
import { EtiquetaEstadoEntrega } from './EtiquetaEstadoEntrega.tsx'
import { FiltroDeCliente } from './FiltroDeCliente.tsx'

/** Todas las entregas, las más recientes primero: retiros, deliveries y los intentos fallidos o cancelados. */
export function EntregasHistorial() {
  const { leer, pagina, cambiar, cambiarPagina } = useFiltrosDeLista()
  const estado = estadosDeEntrega.find((codigo) => codigo === leer('estado')) ?? ''
  const tipo = tiposDeEntrega.find((codigo) => codigo === leer('tipo')) ?? ''
  const idCliente = Number(leer('cliente'))
  const clienteId = Number.isSafeInteger(idCliente) && idCliente > 0 ? idCliente : null
  const lista = useQuery(opcionesListaEntregas({ estado, tipo, clienteId, pagina }))

  return (
    <section className="max-w-4xl">
      <Link to="/entregas" className="text-sm font-medium text-blue-700 hover:underline">
        ← Entregas
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Historial de entregas</h1>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <select value={estado} onChange={(evento) => cambiar('estado', evento.target.value)} aria-label="Estado" className={campoDeFiltro}>
          <option value="">Todos los estados</option>
          {estadosDeEntrega.map((codigo) => (
            <option key={codigo} value={codigo}>
              {estadosDeEntregaVisibles[codigo].nombre}
            </option>
          ))}
        </select>
        <select value={tipo} onChange={(evento) => cambiar('tipo', evento.target.value)} aria-label="Tipo de entrega" className={campoDeFiltro}>
          <option value="">Retiros y deliveries</option>
          {tiposDeEntrega.map((codigo) => (
            <option key={codigo} value={codigo}>
              {nombresDeTipoDeEntrega[codigo]}
            </option>
          ))}
        </select>
      </div>
      {clienteId && <FiltroDeCliente etiqueta="Entregas de:" id={clienteId} alQuitar={() => cambiar('cliente', '')} />}

      <div className="mt-4">
        {lista.isPending ? (
          <p className="text-sm text-slate-500">Cargando entregas…</p>
        ) : lista.isError ? (
          <div className="space-y-3">
            <Aviso tipo="error">{mensajeDeError(lista.error)}</Aviso>
            <Boton variante="secundario" cargando={lista.isFetching} onClick={() => void lista.refetch()}>
              Reintentar
            </Boton>
          </div>
        ) : lista.data.total === 0 ? (
          <p className="text-sm text-slate-600">{estado || tipo || clienteId ? 'Ninguna entrega coincide.' : 'Todavía no hay entregas.'}</p>
        ) : (
          <div className={`space-y-3 ${lista.isPlaceholderData ? 'opacity-60' : ''}`}>
            {lista.data.items.length > 0 && (
              <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                {lista.data.items.map((entrega) => (
                  <li key={entrega.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/paquetes/${entrega.paquete.id}`} className="font-mono font-medium text-blue-800 hover:underline">
                          {entrega.paquete.codigoPaquete}
                        </Link>
                        <EtiquetaEstadoEntrega estado={entrega.estado} />
                      </div>
                      <span className="text-sm text-slate-600">{nombresDeTipoDeEntrega[entrega.tipoEntrega]}</span>
                    </div>
                    <p className="mt-1 text-sm">
                      {nombreDelCliente(entrega.cliente)} <span className="text-slate-500">({entrega.cliente.codigoCliente})</span>
                    </p>
                    <p className="text-sm text-slate-500">
                      {entrega.fechaEntrega
                        ? `Entregada el ${formatearFechaHora(entrega.fechaEntrega)}${entrega.personaRecibe ? ` a ${entrega.personaRecibe}` : ''}`
                        : `Creada el ${formatearFechaHora(entrega.creadoEn)}`}
                      {entrega.responsable && ` · Repartidor: ${entrega.responsable.nombre}`}
                    </p>
                    {entrega.observaciones && <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{entrega.observaciones}</p>}
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
