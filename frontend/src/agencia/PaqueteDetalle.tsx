import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { usePermiso } from '../auth/identidad.ts'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { Dato } from '../components/Dato.tsx'
import { EnlaceBoton } from '../components/EnlaceBoton.tsx'
import { formatearFechaHora } from '../lib/formato.ts'
import { CancelarPaquete, Pesar, RecibirEnMiami } from './AccionesDePaquete.tsx'
import { nombreDelCliente } from './clientes.ts'
import { claveEmbarques } from './embarques.ts'
import { ConPaquete } from './ConPaquete.tsx'
import { EtiquetaEstadoPaquete } from './EtiquetaEstadoPaquete.tsx'
import { HistorialPaquete } from './HistorialPaquete.tsx'
import {
  clavePaquetes,
  esFinal,
  opcionesHistorialPaquete,
  opcionesPaquete,
  sePuedeCancelar,
  sePuedePesar,
  sePuedeRecibirEnMiami,
  textoDelCalculo,
  type Paquete,
} from './paquetes.ts'

/** Lo que trae la navegación: un aviso, si se acaba de registrar y los filtros de la lista de la que se vino. */
type EstadoDeNavegacion = { aviso?: string; registrado?: boolean; lista?: string } | null

type Accion = 'recibir' | 'pesar' | 'cancelar'

export function PaqueteDetalle() {
  const navegacion = useLocation().state as EstadoDeNavegacion
  return (
    <ConPaquete volver={`/paquetes${navegacion?.lista ?? ''}`}>
      {(paquete) => <Detalle paquete={paquete} navegacion={navegacion} />}
    </ConPaquete>
  )
}

function Detalle({ paquete, navegacion }: { paquete: Paquete; navegacion: EstadoDeNavegacion }) {
  const gestiona = usePermiso('GestionarPaquetes')
  const operaBodega = usePermiso('OperarBodega')
  const queryClient = useQueryClient()
  // Recién registrado, el aviso ofrece registrar otro paquete para el mismo cliente (suelen avisar varios).
  const [aviso, setAviso] = useState(navegacion?.aviso ? { texto: navegacion.aviso, otro: navegacion.registrado === true } : undefined)
  const [accion, setAccion] = useState<Accion>()
  const estado = paquete.estado.codigo
  const lista = `/paquetes${navegacion?.lista ?? ''}`

  const abrir = (nueva: Accion) => {
    setAviso(undefined)
    setAccion(nueva)
  }
  const terminar = (actualizado: Paquete, texto: string) => {
    queryClient.setQueryData(opcionesPaquete(actualizado.id).queryKey, actualizado)
    void queryClient.invalidateQueries({ queryKey: opcionesHistorialPaquete(actualizado.id).queryKey })
    void queryClient.invalidateQueries({ queryKey: [...clavePaquetes, 'lista'] })
    // Cancelar un paquete lo quita de su embarque: cambia la cantidad y la lista de paquetes del embarque.
    if (paquete.codigoEmbarque) void queryClient.invalidateQueries({ queryKey: claveEmbarques })
    setAccion(undefined)
    setAviso({ texto, otro: false })
  }
  const propsDeAccion = { paquete, alTerminar: terminar, alVolver: () => setAccion(undefined) }

  const recibir = operaBodega && sePuedeRecibirEnMiami(estado)
  const pesar = operaBodega && sePuedePesar(estado)
  const editar = gestiona && !esFinal(estado)
  const cancelar = gestiona && sePuedeCancelar(estado)

  return (
    <section className="max-w-3xl">
      <Link to={lista} className="text-sm font-medium text-blue-700 hover:underline">
        ← Paquetes
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-xl font-semibold">{paquete.codigoPaquete}</h1>
        <EtiquetaEstadoPaquete estado={paquete.estado} />
      </div>
      {aviso && (
        <div className="mt-4">
          <Aviso tipo="exito">
            {aviso.texto}
            {aviso.otro && (
              <>
                {' '}
                <Link to={`/paquetes/nuevo?cliente=${paquete.cliente.id}`} className="font-medium underline">
                  Registrar otro paquete para {nombreDelCliente(paquete.cliente)}
                </Link>
              </>
            )}
          </Aviso>
        </div>
      )}

      <dl className="mt-6 grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 sm:p-6">
        <Dato
          nombre="Cliente"
          valor={
            <>
              <Link to={`/clientes/${paquete.cliente.id}`} className="font-medium text-blue-800 hover:underline">
                {nombreDelCliente(paquete.cliente)}
              </Link>{' '}
              <span className="text-slate-500">({paquete.cliente.codigoCliente})</span>
            </>
          }
        />
        <Dato nombre="Método de envío" valor={paquete.metodoEnvio.nombre} />
        <Dato nombre="Tracking" valor={paquete.trackingExterno} />
        <Dato nombre="Tienda" valor={paquete.tienda} />
        <Dato nombre="Descripción" valor={paquete.descripcion} ancho />
        <Dato
          nombre="Embarque"
          valor={
            paquete.codigoEmbarque && (
              // La API da el código del embarque, no su id: lleva a la lista filtrada por ese código.
              <Link
                to={`/embarques?buscar=${encodeURIComponent(paquete.codigoEmbarque)}`}
                className="font-medium text-blue-800 hover:underline"
              >
                {paquete.codigoEmbarque}
              </Link>
            )
          }
        />
        <Dato nombre="Peso y monto" valor={textoDelCalculo(paquete)} />
        <Dato nombre="Registrado" valor={formatearFechaHora(paquete.fechaRegistro)} />
        <Dato nombre="Recibido en Miami" valor={paquete.fechaRecepcionMiami && formatearFechaHora(paquete.fechaRecepcionMiami)} />
        <Dato
          nombre="Recibido en Nicaragua"
          valor={paquete.fechaRecepcionNicaragua && formatearFechaHora(paquete.fechaRecepcionNicaragua)}
        />
        <Dato nombre="Última modificación" valor={formatearFechaHora(paquete.actualizadoEn)} />
      </dl>

      {accion === undefined && (recibir || pesar || editar || cancelar) && (
        <div className="mt-6 flex flex-wrap gap-3">
          {recibir && <Boton onClick={() => abrir('recibir')}>Recibir en Miami</Boton>}
          {pesar && <Boton onClick={() => abrir('pesar')}>{estado === 'PENDIENTE_DE_PAGO' ? 'Corregir peso' : 'Registrar peso'}</Boton>}
          {editar && (
            <EnlaceBoton to="editar" state={{ lista: navegacion?.lista }} variante="secundario">
              Editar datos
            </EnlaceBoton>
          )}
          {cancelar && (
            <Boton variante="peligro" onClick={() => abrir('cancelar')}>
              Cancelar paquete
            </Boton>
          )}
        </div>
      )}
      {esFinal(estado) && (
        <p className="mt-4 text-sm text-slate-500">El paquete está {paquete.estado.nombre.toLowerCase()}: ya no cambia.</p>
      )}

      {accion && (
        <div className="mt-6">
          {accion === 'recibir' && <RecibirEnMiami {...propsDeAccion} />}
          {accion === 'pesar' && <Pesar {...propsDeAccion} />}
          {accion === 'cancelar' && <CancelarPaquete {...propsDeAccion} />}
        </div>
      )}

      <HistorialPaquete id={paquete.id} />
    </section>
  )
}
