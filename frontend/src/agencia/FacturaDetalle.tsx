import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { usePermiso } from '../auth/identidad.ts'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { Dato } from '../components/Dato.tsx'
import { Etiqueta } from '../components/Etiqueta.tsx'
import { formatearDolares, formatearFechaHora } from '../lib/formato.ts'
import { AnularFactura, AnularPago, RegistrarPago } from './AccionesDeFactura.tsx'
import { nombreDelCliente } from './clientes.ts'
import { ConFactura } from './ConFactura.tsx'
import { EnlaceAuditoria } from './EnlaceAuditoria.tsx'
import { EtiquetaEstadoDePago } from './EtiquetaEstadoDePago.tsx'
import {
  claveFacturas,
  nombresDeMetodoDePago,
  opcionesFactura,
  sePuedeAnular,
  sePuedeAnularElPago,
  sePuedePagar,
  textoDelPago,
  type Factura,
} from './facturas.ts'
import { clavePaquetes } from './paquetes.ts'

/** Lo que trae la navegación: un aviso para mostrar y los filtros de la lista de la que se vino. */
type EstadoDeNavegacion = { aviso?: string; lista?: string } | null

export function FacturaDetalle() {
  const navegacion = useLocation().state as EstadoDeNavegacion
  return (
    <ConFactura volver={`/facturas${navegacion?.lista ?? ''}`}>
      {(factura) => <Detalle factura={factura} navegacion={navegacion} />}
    </ConFactura>
  )
}

function Detalle({ factura, navegacion }: { factura: Factura; navegacion: EstadoDeNavegacion }) {
  const anula = usePermiso('AdministrarFinanzas')
  const audita = usePermiso('VerAuditoria')
  const queryClient = useQueryClient()
  const [aviso, setAviso] = useState(navegacion?.aviso)
  const [accion, setAccion] = useState<'pagar' | 'anular'>()
  const [pagoQueSeAnula, setPagoQueSeAnula] = useState<number>()
  const lista = `/facturas${navegacion?.lista ?? ''}`
  const anulada = factura.estado === 'ANULADA'

  /** Pagos y anulaciones cambian el saldo y pueden cambiar el estado de los paquetes: se espera la factura nueva. */
  const terminar = async (texto: string) => {
    void queryClient.invalidateQueries({ queryKey: claveFacturas })
    void queryClient.invalidateQueries({ queryKey: clavePaquetes })
    await queryClient.invalidateQueries({ queryKey: opcionesFactura(factura.id).queryKey })
    setAccion(undefined)
    setPagoQueSeAnula(undefined)
    setAviso(texto)
  }
  const propsDeAccion = { factura, alTerminar: terminar }
  const abrir = (nueva: 'pagar' | 'anular') => {
    setAviso(undefined)
    setPagoQueSeAnula(undefined)
    setAccion(nueva)
  }
  const ocupado = accion !== undefined || pagoQueSeAnula !== undefined

  return (
    <section className="max-w-3xl">
      <Link to={lista} className="text-sm font-medium text-blue-700 hover:underline">
        ← Facturación
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-xl font-semibold">{factura.numeroFactura}</h1>
        <EtiquetaEstadoDePago estado={factura.estadoPago} />
      </div>
      {aviso && (
        <div className="mt-4">
          <Aviso tipo="exito">{aviso}</Aviso>
        </div>
      )}

      <dl className="mt-6 grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 sm:p-6">
        <Dato
          nombre="Cliente"
          valor={
            <>
              <Link to={`/clientes/${factura.cliente.id}`} className="font-medium text-blue-800 hover:underline">
                {nombreDelCliente(factura.cliente)}
              </Link>{' '}
              <span className="text-slate-500">({factura.cliente.codigoCliente})</span>
            </>
          }
        />
        <Dato nombre="Emitida" valor={formatearFechaHora(factura.fecha)} />
        <Dato nombre="Total" valor={formatearDolares(factura.total)} />
        <Dato nombre="Pagado" valor={formatearDolares(factura.pagado)} />
        {anulada ? (
          <>
            <Dato nombre="Anulada" valor={factura.anuladaEn && formatearFechaHora(factura.anuladaEn)} />
            <Dato nombre="Motivo de la anulación" valor={factura.motivoAnulacion} />
          </>
        ) : (
          <Dato nombre="Saldo" valor={<strong className="text-base">{formatearDolares(factura.saldo)}</strong>} ancho />
        )}
      </dl>
      {audita && <EnlaceAuditoria tabla="facturas" registro={factura.id} />}

      {!ocupado && (sePuedePagar(factura) || (anula && sePuedeAnular(factura))) && (
        <div className="mt-6 flex flex-wrap gap-3">
          {sePuedePagar(factura) && <Boton onClick={() => abrir('pagar')}>Registrar pago</Boton>}
          {anula && sePuedeAnular(factura) && (
            <Boton variante="peligro" onClick={() => abrir('anular')}>
              Anular factura
            </Boton>
          )}
        </div>
      )}
      {accion && (
        <div className="mt-6">
          {accion === 'pagar' && <RegistrarPago {...propsDeAccion} alVolver={() => setAccion(undefined)} />}
          {accion === 'anular' && <AnularFactura {...propsDeAccion} alVolver={() => setAccion(undefined)} />}
        </div>
      )}

      <section aria-labelledby="titulo-lineas" className="mt-8">
        <h2 id="titulo-lineas" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Detalle
        </h2>
        <ul className="mt-2 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {factura.lineas.map((linea) => (
            <li key={linea.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
              {linea.paqueteId !== null ? (
                <Link to={`/paquetes/${linea.paqueteId}`} className="text-blue-800 hover:underline">
                  {linea.descripcion}
                </Link>
              ) : (
                <span>{linea.descripcion}</span>
              )}
              <span className="font-medium">{formatearDolares(linea.subtotal)}</span>
            </li>
          ))}
          <li className="flex justify-between gap-4 bg-slate-50 px-4 py-3 text-sm font-semibold">
            <span>Total</span>
            <span>{formatearDolares(factura.total)}</span>
          </li>
        </ul>
      </section>

      <section aria-labelledby="titulo-pagos" className="mt-8">
        <h2 id="titulo-pagos" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Pagos
        </h2>
        {factura.pagos.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">Sin pagos todavía.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {factura.pagos.map((pago) => (
              <li key={pago.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${pago.estado === 'ANULADO' ? 'text-slate-500 line-through' : ''}`}>
                      {textoDelPago(pago)}
                    </p>
                    <p className="text-sm text-slate-500">
                      {nombresDeMetodoDePago[pago.metodoPago]}
                      {pago.referencia && ` · Ref. ${pago.referencia}`} · {formatearFechaHora(pago.fecha)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {pago.estado === 'APLICADO' ? <Etiqueta tono="verde">Aplicado</Etiqueta> : <Etiqueta tono="rojo">Anulado</Etiqueta>}
                    {anula && sePuedeAnularElPago(pago) && !ocupado && (
                      <Boton
                        variante="secundario"
                        onClick={() => {
                          setAviso(undefined)
                          setPagoQueSeAnula(pago.id)
                        }}
                      >
                        Anular pago
                      </Boton>
                    )}
                  </div>
                </div>
                {pago.estado === 'ANULADO' && (
                  <p className="mt-1 text-sm text-slate-600">
                    Anulado{pago.anuladoEn && ` el ${formatearFechaHora(pago.anuladoEn)}`}: {pago.motivoAnulacion}
                  </p>
                )}
                {pagoQueSeAnula === pago.id && (
                  <div className="mt-3">
                    <AnularPago {...propsDeAccion} pago={pago} alVolver={() => setPagoQueSeAnula(undefined)} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}
