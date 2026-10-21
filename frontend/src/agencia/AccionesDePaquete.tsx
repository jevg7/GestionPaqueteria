import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { AreaDeTexto } from '../components/AreaDeTexto.tsx'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { Campo } from '../components/Campo.tsx'
import { mensajeDeError } from '../lib/errores.ts'
import { formatearDolares } from '../lib/formato.ts'
import { mensajeDelEnvio } from '../lib/formularios.ts'
import {
  cancelarPaquete,
  esquemaCancelacion,
  esquemaPesaje,
  esquemaRecepcion,
  montoEstimado,
  pesarPaquete,
  recibirEnMiami,
  textoDelCalculo,
  type DatosCancelacion,
  type DatosPesaje,
  type DatosRecepcion,
  type FormularioPesaje,
  type Paquete,
} from './paquetes.ts'
import { opcionesTarifasDeHoy, precioDeTarifa } from './tarifas.ts'

// Las acciones de la ficha del paquete. Cada una muestra su formulario en la página; "Volver" la cierra sin cambios
// (no "Cancelar": en un paquete, cancelar es otra cosa).

type Props = {
  paquete: Paquete
  /** Con el paquete como quedó según la API y el aviso para el usuario. */
  alTerminar: (actualizado: Paquete, aviso: string) => void
  alVolver: () => void
}

const marco = 'space-y-4 rounded-xl border border-slate-200 bg-white p-4'

/** REGISTRADO → RECIBIDO_EN_MIAMI, con una observación opcional. */
export function RecibirEnMiami({ paquete, alTerminar, alVolver }: Props) {
  const [errorGeneral, setErrorGeneral] = useState<string>()
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<DatosRecepcion>({ resolver: zodResolver(esquemaRecepcion), defaultValues: { observacion: '' } })
  const recepcion = useMutation({ mutationFn: (datos: DatosRecepcion) => recibirEnMiami(paquete.id, datos.observacion) })

  const recibir = async (datos: DatosRecepcion) => {
    setErrorGeneral(undefined)
    try {
      alTerminar(await recepcion.mutateAsync(datos), `Paquete ${paquete.codigoPaquete} recibido en Miami.`)
    } catch (error) {
      setErrorGeneral(mensajeDeError(error))
    }
  }

  return (
    <form onSubmit={handleSubmit(recibir)} noValidate className={marco}>
      <p className="text-sm text-slate-700">
        Confirme que el paquete llegó a la bodega de Miami
        {paquete.trackingExterno ? ` con el tracking ${paquete.trackingExterno}.` : '.'}
      </p>
      <AreaDeTexto etiqueta="Observación (opcional)" rows={2} placeholder="Por ejemplo: caja golpeada" {...register('observacion')} />
      {errorGeneral && <Aviso tipo="error">{errorGeneral}</Aviso>}
      <div className="flex flex-wrap gap-3">
        <Boton type="submit" cargando={isSubmitting}>
          Confirmar recepción
        </Boton>
        <Boton variante="secundario" disabled={isSubmitting} onClick={alVolver}>
          Volver
        </Boton>
      </div>
    </form>
  )
}

/**
 * Registra el peso al llegar a Nicaragua (→ PENDIENTE_DE_PAGO) o lo corrige en PENDIENTE_DE_PAGO. Muestra la tarifa de
 * hoy y el monto que resultará; el cálculo definitivo lo hace la API.
 */
export function Pesar({ paquete, alTerminar, alVolver }: Props) {
  const corrige = paquete.estado.codigo === 'PENDIENTE_DE_PAGO'
  const metodo = paquete.metodoEnvio
  const tarifas = useQuery(opcionesTarifasDeHoy)
  // undefined mientras carga; null si el método no tiene tarifa hoy (la API respondería 409).
  const tarifa = tarifas.data ? (tarifas.data.find((deHoy) => deHoy.metodoEnvio.codigo === metodo.codigo)?.tarifa ?? null) : undefined
  const [errorGeneral, setErrorGeneral] = useState<string>()
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormularioPesaje, unknown, DatosPesaje>({
    resolver: zodResolver(esquemaPesaje),
    defaultValues: { pesoLb: corrige && paquete.pesoLb !== null ? paquete.pesoLb.toFixed(2) : '' },
  })
  const pesoEscrito = useWatch({ control, name: 'pesoLb' })
  const peso = esquemaPesaje.shape.pesoLb.safeParse(pesoEscrito)
  const pesaje = useMutation({ mutationFn: (datos: DatosPesaje) => pesarPaquete(paquete.id, datos.pesoLb) })

  const pesar = async (datos: DatosPesaje) => {
    setErrorGeneral(undefined)
    try {
      const actualizado = await pesaje.mutateAsync(datos)
      const calculo = textoDelCalculo(actualizado)
      alTerminar(
        actualizado,
        corrige ? `Peso corregido: ${calculo}.` : `Peso registrado: ${calculo}. El paquete quedó pendiente de pago.`,
      )
    } catch (error) {
      // 409: sin tarifa vigente, o el paquete ya está en una factura (la API dice cuál).
      setErrorGeneral(mensajeDelEnvio(error, setError, ['pesoLb']))
    }
  }

  return (
    <form onSubmit={handleSubmit(pesar)} noValidate className={marco}>
      <div className="max-w-xs">
        <Campo
          etiqueta="Peso (lb)"
          inputMode="decimal"
          placeholder="4.50"
          autoComplete="off"
          error={errors.pesoLb?.message}
          {...register('pesoLb')}
        />
      </div>
      {tarifas.isError ? (
        <Aviso tipo="error">No se pudo leer la tarifa de hoy: {mensajeDeError(tarifas.error)}</Aviso>
      ) : tarifa === undefined ? (
        <p className="text-sm text-slate-500">Cargando la tarifa de hoy…</p>
      ) : tarifa === null ? (
        <Aviso tipo="advertencia">
          No hay tarifa vigente hoy para {metodo.nombre}: un administrador debe registrarla en Tarifas antes de pesar.
        </Aviso>
      ) : (
        <p className="text-sm text-slate-700">
          Tarifa de hoy ({metodo.nombre}): {precioDeTarifa(tarifa)}.
          {peso.success && (
            <>
              {' '}
              Monto: <strong>{formatearDolares(montoEstimado(peso.data, tarifa.precioPorUnidad))}</strong>.
            </>
          )}
        </p>
      )}
      {corrige && (
        <p className="text-xs text-slate-500">
          El monto se recalcula con la tarifa de hoy. Si el paquete ya está en una factura, primero hay que anularla.
        </p>
      )}
      {errorGeneral && <Aviso tipo="error">{errorGeneral}</Aviso>}
      <div className="flex flex-wrap gap-3">
        <Boton type="submit" cargando={isSubmitting} disabled={tarifa === null}>
          {corrige ? 'Corregir peso' : 'Registrar peso'}
        </Boton>
        <Boton variante="secundario" disabled={isSubmitting} onClick={alVolver}>
          Volver
        </Boton>
      </div>
    </form>
  )
}

/** REGISTRADO, RECIBIDO_EN_MIAMI o PENDIENTE_DE_ENVIO → CANCELADO, con motivo. No se puede deshacer. */
export function CancelarPaquete({ paquete, alTerminar, alVolver }: Props) {
  const [errorGeneral, setErrorGeneral] = useState<string>()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DatosCancelacion>({ resolver: zodResolver(esquemaCancelacion), defaultValues: { motivo: '' } })
  const cancelacion = useMutation({ mutationFn: (datos: DatosCancelacion) => cancelarPaquete(paquete.id, datos.motivo) })

  const cancelar = async (datos: DatosCancelacion) => {
    setErrorGeneral(undefined)
    try {
      alTerminar(await cancelacion.mutateAsync(datos), `Paquete ${paquete.codigoPaquete} cancelado.`)
    } catch (error) {
      setErrorGeneral(mensajeDelEnvio(error, setError, ['motivo']))
    }
  }

  return (
    <form onSubmit={handleSubmit(cancelar)} noValidate className={marco}>
      <p className="text-sm text-slate-700">
        ¿Cancelar el paquete {paquete.codigoPaquete}? Deja de seguir el flujo
        {paquete.codigoEmbarque && ` y se quita del embarque ${paquete.codigoEmbarque}`}.
        {paquete.trackingExterno && ' Su tracking queda libre para registrarlo de nuevo.'} No se puede deshacer.
      </p>
      <AreaDeTexto etiqueta="Motivo" rows={2} error={errors.motivo?.message} {...register('motivo')} />
      {errorGeneral && <Aviso tipo="error">{errorGeneral}</Aviso>}
      <div className="flex flex-wrap gap-3">
        <Boton type="submit" variante="peligro" cargando={isSubmitting}>
          Sí, cancelar paquete
        </Boton>
        <Boton variante="secundario" disabled={isSubmitting} onClick={alVolver}>
          Volver
        </Boton>
      </div>
    </form>
  )
}
