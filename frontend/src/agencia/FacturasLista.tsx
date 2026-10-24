import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { EnlaceBoton } from '../components/EnlaceBoton.tsx'
import { Paginacion } from '../components/Paginacion.tsx'
import { campoDeFiltro } from '../components/estilos.ts'
import { mensajeDeError } from '../lib/errores.ts'
import { formatearDolares, formatearFecha } from '../lib/formato.ts'
import { useDiferido } from '../lib/useDiferido.ts'
import { useFiltrosDeLista } from '../lib/useFiltrosDeLista.ts'
import { nombreDelCliente } from './clientes.ts'
import { EtiquetaEstadoDePago } from './EtiquetaEstadoDePago.tsx'
import { FiltroDeCliente } from './FiltroDeCliente.tsx'
import { estadosDePago, estadosDePagoVisibles, opcionesListaFacturas, TAMANO_DE_PAGINA } from './facturas.ts'

/** Facturas (comprobante interno en USD), las más recientes primero. Emiten y cobran ADMIN y AGENTE. */
export function FacturasLista() {
  const { leer, pagina, cambiar, cambiarPagina } = useFiltrosDeLista()
  const ubicacion = useLocation()
  const buscar = leer('buscar')
  const estadoPago = estadosDePago.find((codigo) => codigo === leer('estado')) ?? ''
  // El filtro por cliente llega desde su ficha ("Ver sus facturas").
  const idCliente = Number(leer('cliente'))
  const clienteId = Number.isSafeInteger(idCliente) && idCliente > 0 ? idCliente : null
  const buscarDiferido = useDiferido(buscar.trim())
  const lista = useQuery(opcionesListaFacturas({ buscar: buscarDiferido, estadoPago, clienteId, pagina }))

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Facturación</h1>
        <EnlaceBoton to={clienteId ? `nueva?cliente=${clienteId}` : 'nueva'}>Emitir factura</EnlaceBoton>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          value={buscar}
          onChange={(evento) => cambiar('buscar', evento.target.value)}
          placeholder="Buscar por número (FAC-000001)"
          aria-label="Buscar facturas"
          maxLength={30}
          className={`${campoDeFiltro} w-full sm:max-w-xs`}
        />
        <select value={estadoPago} onChange={(evento) => cambiar('estado', evento.target.value)} aria-label="Estado de pago" className={campoDeFiltro}>
          <option value="">Todos los estados</option>
          {estadosDePago.map((codigo) => (
            <option key={codigo} value={codigo}>
              {estadosDePagoVisibles[codigo].nombre}
            </option>
          ))}
        </select>
      </div>
      {clienteId && <FiltroDeCliente etiqueta="Facturas de:" id={clienteId} alQuitar={() => cambiar('cliente', '')} />}

      <div className="mt-4">
        {lista.isPending ? (
          <p className="text-sm text-slate-500">Cargando facturas…</p>
        ) : lista.isError ? (
          <div className="space-y-3">
            <Aviso tipo="error">{mensajeDeError(lista.error)}</Aviso>
            <Boton variante="secundario" cargando={lista.isFetching} onClick={() => void lista.refetch()}>
              Reintentar
            </Boton>
          </div>
        ) : lista.data.total === 0 ? (
          <p className="text-sm text-slate-600">
            {buscarDiferido || estadoPago || clienteId ? 'Ninguna factura coincide con la búsqueda.' : 'Todavía no hay facturas.'}
          </p>
        ) : (
          <div className={`space-y-3 ${lista.isPlaceholderData ? 'opacity-60' : ''}`}>
            {lista.data.items.length > 0 && (
              <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                {lista.data.items.map((factura) => (
                  <li key={factura.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={String(factura.id)}
                          state={{ lista: ubicacion.search }}
                          className="font-mono font-medium text-blue-800 hover:underline"
                        >
                          {factura.numeroFactura}
                        </Link>
                        <EtiquetaEstadoDePago estado={factura.estadoPago} />
                      </div>
                      <span className="text-sm text-slate-600">{formatearFecha(factura.fecha)}</span>
                    </div>
                    <p className="mt-1 text-sm">
                      {nombreDelCliente(factura.cliente)} <span className="text-slate-500">({factura.cliente.codigoCliente})</span>
                    </p>
                    <p className="text-sm text-slate-500">
                      Total {formatearDolares(factura.total)}
                      {factura.estado === 'EMITIDA' && (
                        <>
                          {' '}
                          · Pagado {formatearDolares(factura.pagado)} ·{' '}
                          <span className={factura.saldo > 0 ? 'font-medium text-slate-900' : undefined}>
                            Saldo {formatearDolares(factura.saldo)}
                          </span>
                        </>
                      )}
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
