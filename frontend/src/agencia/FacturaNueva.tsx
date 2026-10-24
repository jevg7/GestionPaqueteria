import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { EnlaceBoton } from '../components/EnlaceBoton.tsx'
import { sumaDeMontos } from '../lib/dinero.ts'
import { mensajeDeError } from '../lib/errores.ts'
import { formatearDolares } from '../lib/formato.ts'
import { nombreDelCliente, opcionesCliente, referenciaDe, type ReferenciaCliente } from './clientes.ts'
import {
  claveFacturas,
  emitirFactura,
  facturadosEn,
  MAXIMO_POR_FACTURA,
  opcionesFactura,
  opcionesFacturasConSaldo,
  opcionesPaquetesPendientesDePago,
} from './facturas.ts'
import { textoDelCalculo } from './paquetes.ts'
import { SelectorDeCliente } from './SelectorDeCliente.tsx'

const LISTA = '/facturas'

/** Emite la factura de los paquetes pendientes de pago de un cliente. Con ?cliente=<id> llega con el cliente elegido. */
export function FacturaNueva() {
  const [parametros] = useSearchParams()
  const idCliente = Number(parametros.get('cliente'))
  const conCliente = Number.isSafeInteger(idCliente) && idCliente > 0
  const cliente = useQuery({ ...opcionesCliente(conCliente ? idCliente : 0), enabled: conCliente })

  if (conCliente && cliente.isPending) return <p className="text-sm text-slate-500">Cargando…</p>
  return <Formulario clienteInicial={cliente.data ? referenciaDe(cliente.data) : null} />
}

function Formulario({ clienteInicial }: { clienteInicial: ReferenciaCliente | null }) {
  const [cliente, setCliente] = useState(clienteInicial)
  return (
    <section className="max-w-3xl">
      <Link to={LISTA} className="text-sm font-medium text-blue-700 hover:underline">
        ← Facturación
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Emitir factura</h1>
      <p className="mt-1 text-sm text-slate-600">
        Comprobante interno en dólares de los paquetes pesados de un cliente: una línea por paquete (peso × tarifa; la
        tarifa ya incluye el IVA). El número (FAC-…) lo asigna el sistema.
      </p>
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
        <SelectorDeCliente valor={cliente} alCambiar={setCliente} soloActivos={false} />
      </div>
      {/* key: al cambiar de cliente, la selección empieza de nuevo. */}
      {cliente ? (
        <PaquetesPorFacturar key={cliente.id} cliente={cliente} />
      ) : (
        <div className="mt-6">
          <EnlaceBoton to={LISTA} variante="secundario">
            Cancelar
          </EnlaceBoton>
        </div>
      )}
    </section>
  )
}

function PaquetesPorFacturar({ cliente }: { cliente: ReferenciaCliente }) {
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const [pendientes, conSaldo] = useQueries({
    queries: [opcionesPaquetesPendientesDePago(cliente.id), opcionesFacturasConSaldo(cliente.id)],
  })
  const facturados = useMemo(() => facturadosEn(conSaldo.data ?? []), [conSaldo.data])
  const facturables = (pendientes.data?.items ?? []).filter((paquete) => !facturados.has(paquete.id))
  const yaFacturados = (pendientes.data?.items ?? []).filter((paquete) => facturados.has(paquete.id))
  // Todos van en la factura salvo los que se desmarquen (lo normal es cobrar todo lo pendiente).
  const [excluidos, setExcluidos] = useState<ReadonlySet<number>>(new Set())
  const elegidos = facturables.filter((paquete) => !excluidos.has(paquete.id))
  const total = sumaDeMontos(elegidos.map((paquete) => paquete.montoCalculado ?? 0))
  const emision = useMutation({ mutationFn: () => emitirFactura(cliente.id, elegidos.map((paquete) => paquete.id)) })

  const alternar = (id: number, incluir: boolean) =>
    setExcluidos((actuales) => {
      const nuevos = new Set(actuales)
      if (incluir) nuevos.delete(id)
      else nuevos.add(id)
      return nuevos
    })

  const emitir = async () => {
    try {
      const factura = await emision.mutateAsync()
      queryClient.setQueryData(opcionesFactura(factura.id).queryKey, factura)
      void queryClient.invalidateQueries({ queryKey: claveFacturas })
      navegar(`${LISTA}/${factura.id}`, {
        replace: true,
        state: { aviso: `Factura ${factura.numeroFactura} emitida por ${formatearDolares(factura.total)}.` },
      })
    } catch {
      // El error se muestra con emision.error (409: un paquete ya se facturó o cambió de estado mientras tanto).
      void pendientes.refetch()
      void conSaldo.refetch()
    }
  }

  if (pendientes.isPending || conSaldo.isPending) return <p className="mt-6 text-sm text-slate-500">Cargando sus paquetes…</p>
  if (pendientes.isError || conSaldo.isError) {
    return (
      <div className="mt-6 space-y-3">
        <Aviso tipo="error">{mensajeDeError(pendientes.error ?? conSaldo.error)}</Aviso>
        <Boton
          variante="secundario"
          onClick={() => {
            void pendientes.refetch()
            void conSaldo.refetch()
          }}
        >
          Reintentar
        </Boton>
      </div>
    )
  }

  return (
    <div className="mt-6 space-y-6">
      <section aria-labelledby="titulo-por-facturar">
        <h2 id="titulo-por-facturar" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Pendientes de pago sin factura
        </h2>
        {facturables.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">{nombreDelCliente(cliente)} no tiene paquetes pendientes de pago sin factura.</p>
        ) : (
          <ul aria-label="Paquetes por facturar" className="mt-2 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {facturables.map((paquete) => (
              <li key={paquete.id}>
                <label className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={!excluidos.has(paquete.id)}
                    onChange={(evento) => alternar(paquete.id, evento.target.checked)}
                    className="mt-1 size-4 shrink-0 accent-blue-700"
                  />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-mono font-medium">{paquete.codigoPaquete}</span> · {paquete.descripcion}
                    <span className="block text-slate-500">{textoDelCalculo(paquete)}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      {yaFacturados.length > 0 && (
        <section aria-labelledby="titulo-ya-facturados">
          <h2 id="titulo-ya-facturados" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Ya facturados, con saldo por cobrar
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {yaFacturados.map((paquete) => {
              const factura = facturados.get(paquete.id)
              return (
                <li key={paquete.id}>
                  <span className="font-mono">{paquete.codigoPaquete}</span> en la factura{' '}
                  {factura && (
                    <Link to={`${LISTA}/${factura.id}`} className="font-medium text-blue-700 hover:underline">
                      {factura.numeroFactura}
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <div className="space-y-3">
        {facturables.length > 0 && (
          <p className="text-sm" role="status">
            {elegidos.length === 0 ? (
              'Ningún paquete elegido.'
            ) : (
              <>
                Total: <strong>{formatearDolares(total)}</strong> ({elegidos.length === 1 ? '1 paquete' : `${elegidos.length} paquetes`})
              </>
            )}
          </p>
        )}
        {elegidos.length > MAXIMO_POR_FACTURA && (
          <Aviso tipo="advertencia">Una factura lleva hasta {MAXIMO_POR_FACTURA} paquetes: emita varias.</Aviso>
        )}
        {emision.isError && <Aviso tipo="error">{mensajeDeError(emision.error)}</Aviso>}
        <div className="flex flex-wrap gap-3">
          <Boton
            cargando={emision.isPending}
            disabled={elegidos.length === 0 || elegidos.length > MAXIMO_POR_FACTURA}
            onClick={() => void emitir()}
          >
            Emitir factura
          </Boton>
          <EnlaceBoton to={LISTA} variante="secundario">
            Cancelar
          </EnlaceBoton>
        </div>
      </div>
    </div>
  )
}
