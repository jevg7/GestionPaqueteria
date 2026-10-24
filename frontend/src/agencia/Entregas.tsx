import { useQueries, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { useIdentidadActual, usePermiso } from '../auth/identidad.ts'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { EnlaceBoton } from '../components/EnlaceBoton.tsx'
import type { VarianteBoton } from '../components/estilos.ts'
import type { Pagina } from '../lib/api.ts'
import { mensajeDeError } from '../lib/errores.ts'
import { formatearDolares, formatearFechaHora } from '../lib/formato.ts'
import { CancelarEntregas, ConfirmarEntrega, MarcarFallida, SalirARuta } from './AccionesDeEntrega.tsx'
import { nombreDelCliente } from './clientes.ts'
import {
  agruparEnVisitas,
  claveEntregas,
  cobroDeLaVisita,
  ENTREGAS_EN_CURSO,
  esSoloRepartidor,
  opcionesEntregasEn,
  type Entrega,
  type Visita,
} from './entregas.ts'
import { EtiquetaEstadoEntrega } from './EtiquetaEstadoEntrega.tsx'
import { claveFacturas } from './facturas.ts'
import { clavePaquetes } from './paquetes.ts'

type Accion = 'salir' | 'cancelar' | 'confirmar' | 'fallida'

type BotonDeVisita = { accion: Accion; texto: string; variante?: VarianteBoton }

/**
 * Las entregas en curso, agrupadas en visitas (un cliente, una dirección, un repartidor): primero las que están en ruta y
 * después las que esperan salir. El repartidor ve solo las suyas (lo decide la API) y las opera desde el teléfono.
 */
export function Entregas() {
  const soloRepartidor = esSoloRepartidor(useIdentidadActual().roles)
  const programa = usePermiso('ProgramarEntregas')
  const opera = usePermiso('OperarReparto')
  const queryClient = useQueryClient()
  const navegacion = useLocation().state as { aviso?: string } | null
  const [aviso, setAviso] = useState(navegacion?.aviso)
  const [abierta, setAbierta] = useState<{ visita: string; accion: Accion }>()
  const [enRuta, porSalir] = useQueries({ queries: [opcionesEntregasEn('EN_RUTA'), opcionesEntregasEn('PENDIENTE')] })

  /** Las entregas mueven paquetes y cobran facturas: se refresca todo y se espera la lista nueva. */
  const terminar = async (texto: string) => {
    void queryClient.invalidateQueries({ queryKey: clavePaquetes })
    void queryClient.invalidateQueries({ queryKey: claveFacturas })
    await queryClient.invalidateQueries({ queryKey: claveEntregas })
    setAbierta(undefined)
    setAviso(texto)
  }

  const panel = (visita: Visita, accion: Accion): ReactNode => {
    const props = { visita, alTerminar: terminar, alVolver: () => setAbierta(undefined) }
    if (accion === 'salir') return <SalirARuta {...props} />
    if (accion === 'cancelar') return <CancelarEntregas {...props} />
    if (accion === 'confirmar') return <ConfirmarEntrega {...props} />
    return <MarcarFallida {...props} />
  }

  const seccion = (titulo: string, consulta: UseQueryResult<Pagina<Entrega>>, vacia: string, botones: BotonDeVisita[]) => (
    <section aria-label={titulo} className="mt-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{titulo}</h2>
      {consulta.isPending ? (
        <p className="mt-2 text-sm text-slate-500">Cargando…</p>
      ) : consulta.isError ? (
        <div className="mt-2 space-y-3">
          <Aviso tipo="error">{mensajeDeError(consulta.error)}</Aviso>
          <Boton variante="secundario" cargando={consulta.isFetching} onClick={() => void consulta.refetch()}>
            Reintentar
          </Boton>
        </div>
      ) : consulta.data.items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">{vacia}</p>
      ) : (
        <>
          <ul className="mt-2 space-y-3">
            {agruparEnVisitas(consulta.data.items).map((visita) => (
              <TarjetaDeVisita key={visita.clave} visita={visita} mostrarRepartidor={!soloRepartidor}>
                {abierta?.visita === visita.clave ? (
                  <div className="mt-3">{panel(visita, abierta.accion)}</div>
                ) : (
                  botones.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {botones.map((boton) => (
                        <Boton
                          key={boton.accion}
                          variante={boton.variante}
                          onClick={() => {
                            setAviso(undefined)
                            setAbierta({ visita: visita.clave, accion: boton.accion })
                          }}
                        >
                          {boton.texto}
                        </Boton>
                      ))}
                    </div>
                  )
                )}
              </TarjetaDeVisita>
            ))}
          </ul>
          {consulta.data.total > ENTREGAS_EN_CURSO && (
            <p className="mt-2 text-xs text-slate-500">
              Se muestran {ENTREGAS_EN_CURSO} de {consulta.data.total}: el resto, en el historial.
            </p>
          )}
        </>
      )}
    </section>
  )

  return (
    <section className="max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{soloRepartidor ? 'Mis entregas' : 'Entregas'}</h1>
        <div className="flex flex-wrap gap-2">
          {programa && <EnlaceBoton to="nueva">Programar entrega</EnlaceBoton>}
          <EnlaceBoton to="historial" variante="secundario">
            Historial
          </EnlaceBoton>
        </div>
      </div>
      {aviso && (
        <div className="mt-4">
          <Aviso tipo="exito">{aviso}</Aviso>
        </div>
      )}
      {seccion(
        'En ruta',
        enRuta,
        soloRepartidor ? 'No tiene entregas en ruta.' : 'No hay entregas en ruta.',
        opera
          ? [
              { accion: 'confirmar', texto: 'Entregado' },
              { accion: 'fallida', texto: 'No se pudo entregar', variante: 'secundario' },
            ]
          : [],
      )}
      {seccion('Por salir', porSalir, soloRepartidor ? 'No tiene entregas por salir.' : 'No hay entregas por salir.', [
        ...(opera ? [{ accion: 'salir' as const, texto: 'Salir a ruta' }] : []),
        ...(programa ? [{ accion: 'cancelar' as const, texto: 'Cancelar', variante: 'secundario' as const }] : []),
      ])}
    </section>
  )
}

/**
 * Una visita: el cliente (con su teléfono para llamar), la dirección, los paquetes y lo que hay que cobrar. Al repartidor
 * no se le repite su propio nombre.
 */
function TarjetaDeVisita({ visita, mostrarRepartidor, children }: { visita: Visita; mostrarRepartidor: boolean; children: ReactNode }) {
  const datos = [
    mostrarRepartidor && (visita.responsable ? `Repartidor: ${visita.responsable.nombre}` : 'Sin repartidor asignado'),
    visita.fechaProgramada && `Programada: ${formatearFechaHora(visita.fechaProgramada)}`,
  ].filter(Boolean)
  const cobro = cobroDeLaVisita(visita.entregas)
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">
            {nombreDelCliente(visita.cliente)} <span className="text-sm font-normal text-slate-500">({visita.cliente.codigoCliente})</span>
          </p>
          <a href={`tel:${visita.cliente.telefono.replace(/[^\d+]/g, '')}`} className="text-sm text-blue-700 hover:underline">
            {visita.cliente.telefono}
          </a>
        </div>
        <EtiquetaEstadoEntrega estado={visita.estado} />
      </div>
      {visita.direccion && <p className="mt-2 whitespace-pre-line text-sm">{visita.direccion}</p>}
      <ul className="mt-2 space-y-0.5 text-sm text-slate-600">
        {visita.entregas.map((entrega) => (
          <li key={entrega.id}>
            <Link to={`/paquetes/${entrega.paquete.id}`} className="font-mono text-blue-800 hover:underline">
              {entrega.paquete.codigoPaquete}
            </Link>{' '}
            · {entrega.paquete.descripcion}
          </li>
        ))}
      </ul>
      {datos.length > 0 && <p className="mt-2 text-sm text-slate-500">{datos.join(' · ')}</p>}
      {cobro.totalUsd > 0 && (
        <p className="mt-2 text-sm font-medium text-amber-900">
          Cobrar contra entrega: {formatearDolares(cobro.totalUsd)}{' '}
          <span className="font-normal">({cobro.facturas.map((factura) => factura.numeroFactura).join(', ')})</span>
        </p>
      )}
      {children}
    </li>
  )
}
