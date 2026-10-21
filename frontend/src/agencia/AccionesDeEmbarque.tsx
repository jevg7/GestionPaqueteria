import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { AreaDeTexto } from '../components/AreaDeTexto.tsx'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { Campo } from '../components/Campo.tsx'
import { campoDeFiltro } from '../components/estilos.ts'
import { mensajeDeError } from '../lib/errores.ts'
import { fechaHoraEnManagua, formatearFecha } from '../lib/formato.ts'
import { mensajeDelEnvio } from '../lib/formularios.ts'
import { useDiferido } from '../lib/useDiferido.ts'
import { nombreDelCliente } from './clientes.ts'
import {
  asignarPaquetes,
  camposDeEdicionEmbarque,
  datosDeEmbarque,
  editarEmbarque,
  esquemaEdicionEmbarque,
  esquemaFechaDelHecho,
  MAXIMO_POR_ASIGNACION,
  opcionesPaquetesParaAsignar,
  registrarLlegada,
  registrarSalida,
  textoDePaquetes,
  type DatosEdicionEmbarque,
  type DatosFechaDelHecho,
  type Embarque,
  type FormularioEdicionEmbarque,
  type FormularioFechaDelHecho,
} from './embarques.ts'

// Las acciones de la ficha del embarque que piden datos. Cada una muestra su formulario en la página; "Volver" la cierra
// sin cambios. Las que solo confirman (cerrar, cancelar) están en EmbarqueDetalle.

type Props = {
  embarque: Embarque
  /** Con el embarque como quedó según la API y el aviso para el usuario. */
  alTerminar: (actualizado: Embarque, aviso: string) => void
  alVolver: () => void
}

const marco = 'space-y-4 rounded-xl border border-slate-200 bg-white p-4'

/** Llegada estimada y observaciones (UpdateShipmentRequest). */
export function EditarEmbarque({ embarque, alTerminar, alVolver }: Props) {
  const [errorGeneral, setErrorGeneral] = useState<string>()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormularioEdicionEmbarque, unknown, DatosEdicionEmbarque>({
    resolver: zodResolver(esquemaEdicionEmbarque),
    defaultValues: datosDeEmbarque(embarque),
  })
  const edicion = useMutation({ mutationFn: (datos: DatosEdicionEmbarque) => editarEmbarque(embarque.id, datos) })

  const guardar = async (datos: DatosEdicionEmbarque) => {
    setErrorGeneral(undefined)
    try {
      alTerminar(await edicion.mutateAsync(datos), 'Cambios guardados.')
    } catch (error) {
      setErrorGeneral(mensajeDelEnvio(error, setError, camposDeEdicionEmbarque))
    }
  }

  return (
    <form onSubmit={handleSubmit(guardar)} noValidate className={marco}>
      <div className="max-w-xs">
        <Campo etiqueta="Llegada estimada (opcional)" type="date" error={errors.fechaLlegadaEstimada?.message} {...register('fechaLlegadaEstimada')} />
      </div>
      <AreaDeTexto etiqueta="Observaciones (opcional)" rows={2} error={errors.observaciones?.message} {...register('observaciones')} />
      {errorGeneral && <Aviso tipo="error">{errorGeneral}</Aviso>}
      <div className="flex flex-wrap gap-3">
        <Boton type="submit" cargando={isSubmitting}>
          Guardar cambios
        </Boton>
        <Boton variante="secundario" disabled={isSubmitting} onClick={alVolver}>
          Volver
        </Boton>
      </div>
    </form>
  )
}

/**
 * Asigna en lote paquetes RECIBIDO_EN_MIAMI del método del embarque (pasan a PENDIENTE_DE_ENVIO). La selección se conserva
 * al buscar, para elegir de varias búsquedas y asignarlos juntos. Todo o nada: si uno ya no se puede asignar, la API no
 * asigna ninguno.
 */
export function AsignarPaquetes({ embarque, alTerminar, alVolver }: Props) {
  const metodo = embarque.metodoEnvio
  const [buscar, setBuscar] = useState('')
  const termino = useDiferido(buscar.trim())
  const candidatos = useQuery(opcionesPaquetesParaAsignar(metodo.codigo, termino))
  const [elegidos, setElegidos] = useState<ReadonlySet<number>>(new Set())
  const [errorGeneral, setErrorGeneral] = useState<string>()
  const asignacion = useMutation({ mutationFn: (ids: number[]) => asignarPaquetes(embarque.id, ids) })
  const visibles = candidatos.data?.items ?? []
  const todosVisiblesElegidos = visibles.length > 0 && visibles.every((paquete) => elegidos.has(paquete.id))

  const elegir = (ids: number[], marcar: boolean) =>
    setElegidos((actuales) => {
      const nuevos = new Set(actuales)
      for (const id of ids) {
        if (marcar) nuevos.add(id)
        else nuevos.delete(id)
      }
      return nuevos
    })

  const asignar = async () => {
    setErrorGeneral(undefined)
    const cantidad = elegidos.size
    try {
      const actualizado = await asignacion.mutateAsync([...elegidos])
      alTerminar(actualizado, cantidad === 1 ? '1 paquete asignado al embarque.' : `${cantidad} paquetes asignados al embarque.`)
    } catch (error) {
      // 409/400: alguno cambió de estado o ya no existe. No se asignó ninguno: se refresca la lista para elegir de nuevo.
      setErrorGeneral(mensajeDeError(error))
      void candidatos.refetch()
    }
  }

  return (
    <div className={marco}>
      <p className="text-sm text-slate-700">
        Paquetes recibidos en Miami con envío {metodo.nombre.toLowerCase()}: pasan a Pendiente de envío. Si uno ya no se puede
        asignar, no se asigna ninguno.
      </p>
      <input
        type="search"
        value={buscar}
        onChange={(evento) => setBuscar(evento.target.value)}
        placeholder="Buscar por código, tracking o descripción"
        aria-label="Buscar paquetes para asignar"
        maxLength={100}
        className={`${campoDeFiltro} w-full`}
      />

      {candidatos.isPending ? (
        <p className="text-sm text-slate-500">Cargando paquetes…</p>
      ) : candidatos.isError ? (
        <Aviso tipo="error">{mensajeDeError(candidatos.error)}</Aviso>
      ) : visibles.length === 0 ? (
        <p className="text-sm text-slate-600">
          No hay paquetes recibidos en Miami con envío {metodo.nombre.toLowerCase()}
          {termino ? ' que coincidan con la búsqueda' : ''}.
        </p>
      ) : (
        <div className={`space-y-2 ${candidatos.isPlaceholderData ? 'opacity-60' : ''}`}>
          <Boton
            variante="secundario"
            onClick={() =>
              elegir(
                visibles.map((paquete) => paquete.id),
                !todosVisiblesElegidos,
              )
            }
          >
            {todosVisiblesElegidos ? 'Quitar la selección de los mostrados' : `Elegir los ${visibles.length} mostrados`}
          </Boton>
          <ul aria-label="Paquetes para asignar" className="max-h-96 divide-y divide-slate-200 overflow-y-auto rounded-lg border border-slate-200">
            {visibles.map((paquete) => (
              <li key={paquete.id}>
                <label className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-slate-50 has-checked:bg-blue-50">
                  <input
                    type="checkbox"
                    checked={elegidos.has(paquete.id)}
                    onChange={(evento) => elegir([paquete.id], evento.target.checked)}
                    className="mt-1 size-4 shrink-0 accent-blue-700"
                  />
                  <span className="min-w-0 text-sm">
                    <span className="font-mono font-medium">{paquete.codigoPaquete}</span> · {paquete.descripcion}
                    <span className="block truncate text-xs text-slate-500">
                      {nombreDelCliente(paquete.cliente)}
                      {paquete.trackingExterno && ` · Tracking ${paquete.trackingExterno}`}
                      {paquete.fechaRecepcionMiami && ` · Recibido el ${formatearFecha(paquete.fechaRecepcionMiami)}`}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {candidatos.data.total > visibles.length && (
            <p className="text-xs text-slate-500">
              Se muestran {visibles.length} de {candidatos.data.total}: busque para encontrar los demás.
            </p>
          )}
        </div>
      )}

      <p className="text-sm font-medium" role="status">
        {elegidos.size === 0 ? 'Ningún paquete elegido.' : `${textoDePaquetes(elegidos.size)} ${elegidos.size === 1 ? 'elegido' : 'elegidos'}.`}
      </p>
      {elegidos.size > MAXIMO_POR_ASIGNACION && (
        <Aviso tipo="advertencia">Se asignan hasta {MAXIMO_POR_ASIGNACION} paquetes por vez: asígnelos en partes.</Aviso>
      )}
      {errorGeneral && <Aviso tipo="error">{errorGeneral}</Aviso>}
      <div className="flex flex-wrap gap-3">
        <Boton
          cargando={asignacion.isPending}
          disabled={elegidos.size === 0 || elegidos.size > MAXIMO_POR_ASIGNACION}
          onClick={() => void asignar()}
        >
          {elegidos.size > 1 ? `Asignar ${elegidos.size} paquetes` : 'Asignar paquete'}
        </Boton>
        <Boton variante="secundario" disabled={asignacion.isPending} onClick={alVolver}>
          Volver
        </Boton>
      </div>
    </div>
  )
}

/**
 * Registra la salida (CERRADO → EN_TRANSITO) o la llegada (EN_TRANSITO → RECIBIDO): todos sus paquetes cambian de estado
 * con esa fecha. Vacía es ahora; se puede registrar después con la fecha en que ocurrió.
 */
export function RegistrarHecho({ embarque, hecho, alTerminar, alVolver }: Props & { hecho: 'salida' | 'llegada' }) {
  const esLlegada = hecho === 'llegada'
  const esquema = useMemo(() => esquemaFechaDelHecho(hecho, esLlegada ? embarque.fechaSalida : null), [hecho, esLlegada, embarque.fechaSalida])
  // Límites del calendario (el esquema vuelve a comprobarlos): hasta ahora y, la llegada, desde la salida.
  const maximo = useMemo(() => fechaHoraEnManagua(), [])
  const minimo = esLlegada && embarque.fechaSalida ? fechaHoraEnManagua(new Date(embarque.fechaSalida)) : undefined
  const [errorGeneral, setErrorGeneral] = useState<string>()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormularioFechaDelHecho, unknown, DatosFechaDelHecho>({ resolver: zodResolver(esquema), defaultValues: { fecha: '' } })
  const registro = useMutation({
    mutationFn: ({ fecha }: DatosFechaDelHecho) => (esLlegada ? registrarLlegada : registrarSalida)(embarque.id, fecha),
  })
  const susPaquetes = embarque.cantidadPaquetes === 1 ? 'su paquete pasa' : `sus ${embarque.cantidadPaquetes} paquetes pasan`

  const registrar = async (datos: DatosFechaDelHecho) => {
    setErrorGeneral(undefined)
    try {
      const actualizado = await registro.mutateAsync(datos)
      const cantidad = textoDePaquetes(actualizado.cantidadPaquetes).toLowerCase()
      alTerminar(
        actualizado,
        esLlegada
          ? `Llegada registrada: ${cantidad} ${actualizado.cantidadPaquetes === 1 ? 'recibido' : 'recibidos'} en Nicaragua.`
          : `Salida registrada: ${cantidad} en tránsito.`,
      )
    } catch (error) {
      setErrorGeneral(mensajeDelEnvio(error, setError, ['fecha']))
    }
  }

  return (
    <form onSubmit={handleSubmit(registrar)} noValidate className={marco}>
      <p className="text-sm text-slate-700">
        {esLlegada
          ? `El embarque llegó a Nicaragua: ${susPaquetes} a Recibido en Nicaragua, ${embarque.cantidadPaquetes === 1 ? 'listo' : 'listos'} para pesar.`
          : `El embarque salió de Miami: ${susPaquetes} a En tránsito.`}
      </p>
      <div className="max-w-xs">
        <Campo
          etiqueta={esLlegada ? 'Fecha y hora de llegada (opcional)' : 'Fecha y hora de salida (opcional)'}
          type="datetime-local"
          max={maximo}
          min={minimo}
          ayuda="Vacía: ahora. En hora de Managua, si se registra después."
          error={errors.fecha?.message}
          {...register('fecha')}
        />
      </div>
      {errorGeneral && <Aviso tipo="error">{errorGeneral}</Aviso>}
      <div className="flex flex-wrap gap-3">
        <Boton type="submit" cargando={isSubmitting}>
          {esLlegada ? 'Registrar llegada' : 'Registrar salida'}
        </Boton>
        <Boton variante="secundario" disabled={isSubmitting} onClick={alVolver}>
          Volver
        </Boton>
      </div>
    </form>
  )
}
