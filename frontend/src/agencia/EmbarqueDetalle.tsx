import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { usePermiso } from '../auth/identidad.ts'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { Confirmacion } from '../components/Confirmacion.tsx'
import { Dato } from '../components/Dato.tsx'
import { mensajeDeError } from '../lib/errores.ts'
import { formatearDia, formatearFechaHora } from '../lib/formato.ts'
import { AsignarPaquetes, EditarEmbarque, RegistrarHecho } from './AccionesDeEmbarque.tsx'
import { ConEmbarque } from './ConEmbarque.tsx'
import {
  admite,
  cancelarEmbarque,
  cerrarEmbarque,
  claveEmbarques,
  estadosDeEmbarqueVisibles,
  opcionesEmbarque,
  opcionesPaquetesDelEmbarque,
  textoDePaquetes,
  type Embarque,
} from './embarques.ts'
import { EtiquetaEstadoEmbarque } from './EtiquetaEstadoEmbarque.tsx'
import { clavePaquetes } from './paquetes.ts'
import { PaquetesDelEmbarque } from './PaquetesDelEmbarque.tsx'

/** Lo que trae la navegación: un aviso para mostrar y los filtros de la lista de la que se vino. */
type EstadoDeNavegacion = { aviso?: string; lista?: string } | null

type Accion = 'editar' | 'asignar' | 'cerrar' | 'salida' | 'llegada' | 'cancelar'

export function EmbarqueDetalle() {
  const navegacion = useLocation().state as EstadoDeNavegacion
  return (
    <ConEmbarque volver={`/embarques${navegacion?.lista ?? ''}`}>
      {(embarque) => <Detalle embarque={embarque} navegacion={navegacion} />}
    </ConEmbarque>
  )
}

function Detalle({ embarque, navegacion }: { embarque: Embarque; navegacion: EstadoDeNavegacion }) {
  const opera = usePermiso('OperarBodega')
  const queryClient = useQueryClient()
  const [aviso, setAviso] = useState(navegacion?.aviso)
  const [accion, setAccion] = useState<Accion>()
  const lista = `/embarques${navegacion?.lista ?? ''}`
  const puede = (accionDelEmbarque: Parameters<typeof admite>[1]) => opera && admite(embarque, accionDelEmbarque)

  const abrir = (nueva: Accion) => {
    setAviso(undefined)
    setAccion(nueva)
  }
  /** Asignar, quitar, salir y llegar cambian el estado de los paquetes: también se refrescan. */
  const terminar = (actualizado: Embarque, texto: string, cambianPaquetes = true) => {
    queryClient.setQueryData(opcionesEmbarque(actualizado.id).queryKey, actualizado)
    void queryClient.invalidateQueries({ queryKey: [...claveEmbarques, 'lista'] })
    if (cambianPaquetes) {
      void queryClient.invalidateQueries({ queryKey: opcionesPaquetesDelEmbarque(actualizado.id).queryKey })
      void queryClient.invalidateQueries({ queryKey: clavePaquetes })
    }
    setAccion(undefined)
    setAviso(texto)
  }
  const propsDeAccion = { embarque, alTerminar: terminar, alVolver: () => setAccion(undefined) }

  // Cerrar y cancelar solo piden confirmación.
  const cierre = useMutation({
    mutationFn: () => cerrarEmbarque(embarque.id),
    onSuccess: (actualizado) => terminar(actualizado, `Embarque ${actualizado.codigoEmbarque} cerrado: listo para registrar su salida.`, false),
  })
  const cancelacion = useMutation({
    mutationFn: () => cancelarEmbarque(embarque.id),
    onSuccess: (actualizado) => terminar(actualizado, `Embarque ${actualizado.codigoEmbarque} cancelado.`, false),
  })

  const acciones = [
    puede('asignar') && { clave: 'asignar' as const, texto: 'Asignar paquetes' },
    puede('cerrar') && { clave: 'cerrar' as const, texto: 'Cerrar embarque' },
    puede('registrarSalida') && { clave: 'salida' as const, texto: 'Registrar salida' },
    puede('registrarLlegada') && { clave: 'llegada' as const, texto: 'Registrar llegada' },
  ].filter((opcion) => opcion !== false)

  return (
    <section className="max-w-3xl">
      <Link to={lista} className="text-sm font-medium text-blue-700 hover:underline">
        ← Embarques
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-xl font-semibold">{embarque.codigoEmbarque}</h1>
        <EtiquetaEstadoEmbarque estado={embarque.estado} />
      </div>
      {aviso && (
        <div className="mt-4">
          <Aviso tipo="exito">{aviso}</Aviso>
        </div>
      )}

      <dl className="mt-6 grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 sm:p-6">
        <Dato nombre="Método de envío" valor={embarque.metodoEnvio.nombre} />
        <Dato
          nombre="Ruta"
          valor={
            <>
              {embarque.ruta.nombre}{' '}
              <span className="text-slate-500">
                ({embarque.ruta.origen} → {embarque.ruta.destino})
              </span>
            </>
          }
        />
        <Dato nombre="Paquetes" valor={textoDePaquetes(embarque.cantidadPaquetes)} />
        <Dato nombre="Llegada estimada" valor={embarque.fechaLlegadaEstimada && formatearDia(embarque.fechaLlegadaEstimada)} />
        <Dato nombre="Salida" valor={embarque.fechaSalida && formatearFechaHora(embarque.fechaSalida)} />
        <Dato nombre="Llegada" valor={embarque.fechaLlegadaReal && formatearFechaHora(embarque.fechaLlegadaReal)} />
        <Dato nombre="Creado" valor={formatearFechaHora(embarque.creadoEn)} />
        <Dato nombre="Última modificación" valor={formatearFechaHora(embarque.actualizadoEn)} />
        <Dato nombre="Observaciones" valor={embarque.observaciones} ancho />
      </dl>

      {accion === undefined && (acciones.length > 0 || puede('editar') || puede('cancelar')) && (
        <div className="mt-6 flex flex-wrap gap-3">
          {acciones.map((opcion) => (
            <Boton key={opcion.clave} onClick={() => abrir(opcion.clave)}>
              {opcion.texto}
            </Boton>
          ))}
          {puede('editar') && (
            <Boton variante="secundario" onClick={() => abrir('editar')}>
              Editar datos
            </Boton>
          )}
          {puede('cancelar') && (
            <Boton variante="peligro" onClick={() => abrir('cancelar')}>
              Cancelar embarque
            </Boton>
          )}
        </div>
      )}
      {opera && embarque.estado === 'ABIERTO' && embarque.cantidadPaquetes === 0 && accion === undefined && (
        <p className="mt-3 text-xs text-slate-500">Para cerrarlo necesita al menos un paquete.</p>
      )}
      {(embarque.estado === 'RECIBIDO' || embarque.estado === 'CANCELADO') && (
        <p className="mt-4 text-sm text-slate-500">
          El embarque está {estadosDeEmbarqueVisibles[embarque.estado].nombre.toLowerCase()}: ya no cambia.
        </p>
      )}

      {accion && (
        <div className="mt-6">
          {accion === 'editar' && <EditarEmbarque {...propsDeAccion} alTerminar={(actualizado, texto) => terminar(actualizado, texto, false)} />}
          {accion === 'asignar' && <AsignarPaquetes {...propsDeAccion} />}
          {accion === 'salida' && <RegistrarHecho {...propsDeAccion} hecho="salida" />}
          {accion === 'llegada' && <RegistrarHecho {...propsDeAccion} hecho="llegada" />}
          {accion === 'cerrar' && (
            <Confirmacion
              mensaje={`¿Cerrar el embarque con ${textoDePaquetes(embarque.cantidadPaquetes).toLowerCase()}? Ya no se le podrán asignar ni quitar paquetes, y no se reabre.`}
              textoConfirmar="Sí, cerrar embarque"
              cargando={cierre.isPending}
              error={cierre.isError ? mensajeDeError(cierre.error) : undefined}
              alConfirmar={() => cierre.mutate()}
              alCancelar={() => {
                cierre.reset()
                setAccion(undefined)
              }}
            />
          )}
          {accion === 'cancelar' && (
            <Confirmacion
              mensaje="¿Cancelar el embarque? No tiene paquetes. No se puede deshacer."
              textoConfirmar="Sí, cancelar embarque"
              variante="peligro"
              cargando={cancelacion.isPending}
              error={cancelacion.isError ? mensajeDeError(cancelacion.error) : undefined}
              alConfirmar={() => cancelacion.mutate()}
              alCancelar={() => {
                cancelacion.reset()
                setAccion(undefined)
              }}
            />
          )}
        </div>
      )}

      <PaquetesDelEmbarque
        embarque={embarque}
        puedeQuitar={puede('quitar') && accion === undefined}
        alQuitar={(actualizado, texto) => terminar(actualizado, texto)}
      />
    </section>
  )
}
