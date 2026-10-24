import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useIdentidadActual, usePermiso } from '../auth/identidad.ts'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { Campo } from '../components/Campo.tsx'
import { ConfirmacionConMotivo } from '../components/ConfirmacionConMotivo.tsx'
import { Seleccion } from '../components/Seleccion.tsx'
import { mensajeDeError } from '../lib/errores.ts'
import { fechaHoraEnManagua, formatearCordobas, formatearDolares, formatearNumero } from '../lib/formato.ts'
import { mensajeDelEnvio } from '../lib/formularios.ts'
import { nombreDelCliente } from './clientes.ts'
import {
  cancelarEntregas,
  camposDeConfirmacion,
  cobroDeLaVisita,
  cobroEnCordobas,
  confirmarEntrega,
  esquemaConfirmacion,
  esquemaMotivo,
  esSoloRepartidor,
  marcarFallida,
  opcionesRepartidores,
  salirARuta,
  type DatosConfirmacion,
  type FormularioConfirmacion,
  type Visita,
} from './entregas.ts'
import { metodosDePago, nombresDeMetodoDePago, textoDelPago } from './facturas.ts'
import { opcionesTipoDeCambioVigente } from './tiposDeCambio.ts'

// Las acciones sobre una visita (las entregas de un cliente que se operan juntas). Cada una muestra su formulario en la
// página; "Volver" la cierra sin cambios.

type Props = {
  visita: Visita
  /** Cuando la API ya aceptó el cambio: refresca las entregas y muestra el aviso. */
  alTerminar: (aviso: string) => Promise<void>
  alVolver: () => void
}

const marco = 'space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4'

const textoDePaquetes = (cantidad: number) => (cantidad === 1 ? '1 paquete' : `${cantidad} paquetes`)

/**
 * PENDIENTE → EN_RUTA: sus paquetes pasan a En reparto. Un repartidor sale con las suyas (quedan a su nombre); ADMIN y
 * AGENTE salen en nombre del repartidor asignado o eligen uno.
 */
export function SalirARuta({ visita, alTerminar, alVolver }: Props) {
  const soloRepartidor = esSoloRepartidor(useIdentidadActual().roles)
  const eligeRepartidor = usePermiso('ProgramarEntregas') && !soloRepartidor
  const repartidores = useQuery({ ...opcionesRepartidores, enabled: eligeRepartidor })
  const [elegido, setElegido] = useState(visita.responsable ? String(visita.responsable.id) : '')
  const [error, setError] = useState<string>()
  const ids = visita.entregas.map((entrega) => entrega.id)
  const salida = useMutation({ mutationFn: () => salirARuta(ids, soloRepartidor || !elegido ? null : Number(elegido)) })
  const sinRepartidor = !soloRepartidor && !elegido

  const salir = async () => {
    setError(undefined)
    try {
      const entregas = await salida.mutateAsync()
      await alTerminar(`En ruta con ${entregas[0]?.responsable?.nombre ?? 'el repartidor'}: ${textoDePaquetes(entregas.length)} de ${nombreDelCliente(visita.cliente)}.`)
    } catch (fallo) {
      setError(mensajeDeError(fallo))
    }
  }

  return (
    <div className={marco}>
      <p className="text-sm text-slate-700">
        Sale a ruta con {textoDePaquetes(ids.length)} de {nombreDelCliente(visita.cliente)}: pasan a En reparto.
        {soloRepartidor && ' Quedan a su nombre.'}
      </p>
      {eligeRepartidor ? (
        <div className="max-w-sm">
          {repartidores.isError ? (
            <Aviso tipo="error">{mensajeDeError(repartidores.error)}</Aviso>
          ) : (
            <Seleccion etiqueta="Repartidor" value={elegido} onChange={(evento) => setElegido(evento.target.value)}>
              <option value="">{repartidores.isPending ? 'Cargando…' : 'Elija el repartidor…'}</option>
              {repartidores.data?.map((repartidor) => (
                <option key={repartidor.id} value={repartidor.id}>
                  {repartidor.nombre}
                </option>
              ))}
            </Seleccion>
          )}
        </div>
      ) : (
        !soloRepartidor &&
        (visita.responsable ? (
          <p className="text-sm text-slate-700">Repartidor: {visita.responsable.nombre}.</p>
        ) : (
          <Aviso tipo="advertencia">No tiene repartidor asignado: quien programa entregas debe elegirlo al salir a ruta.</Aviso>
        ))
      )}
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="flex flex-wrap gap-3">
        <Boton cargando={salida.isPending} disabled={sinRepartidor} onClick={() => void salir()}>
          Salir a ruta
        </Boton>
        <Boton variante="secundario" disabled={salida.isPending} onClick={alVolver}>
          Volver
        </Boton>
      </div>
    </div>
  )
}

/**
 * EN_RUTA → ENTREGADA: sus paquetes quedan ENTREGADO. Si alguna factura tiene saldo, se cobra completo en la misma
 * operación (contra entrega), en dólares o en córdobas.
 */
export function ConfirmarEntrega({ visita, alTerminar, alVolver }: Props) {
  const cobro = cobroDeLaVisita(visita.entregas)
  const conCobro = cobro.facturas.length > 0
  // Si no se pudo leer el tipo de cambio, el monto en córdobas lo calcula la API al confirmar.
  const vigente = useQuery({ ...opcionesTipoDeCambioVigente, enabled: conCobro })
  const tipoDeCambio = vigente.data?.nioPorUsd ?? null
  const esquema = useMemo(() => esquemaConfirmacion(conCobro), [conCobro])
  const maximo = useMemo(() => fechaHoraEnManagua(), [])
  const [errorGeneral, setErrorGeneral] = useState<string>()
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormularioConfirmacion, unknown, DatosConfirmacion>({
    resolver: zodResolver(esquema),
    defaultValues: { personaRecibe: nombreDelCliente(visita.cliente), fecha: '', moneda: 'USD', metodoPago: '', referencia: '' },
  })
  const moneda = useWatch({ control, name: 'moneda' })
  const ids = visita.entregas.map((entrega) => entrega.id)
  const confirmacion = useMutation({ mutationFn: (datos: DatosConfirmacion) => confirmarEntrega(ids, datos, conCobro) })

  const confirmar = async (datos: DatosConfirmacion) => {
    setErrorGeneral(undefined)
    try {
      const resultado = await confirmacion.mutateAsync(datos)
      const cobrado = resultado.cobros.map((pago) => `${textoDelPago(pago)} (${pago.numeroFactura})`).join(' y ')
      await alTerminar(
        `Entregado a ${datos.personaRecibe}: ${textoDePaquetes(resultado.entregas.length)}.` + (cobrado ? ` Cobrado contra entrega: ${cobrado}.` : ''),
      )
    } catch (error) {
      // 409: la factura cambió (otro cobro) o no hay tipo de cambio para córdobas; 403: es de otro repartidor.
      setErrorGeneral(mensajeDelEnvio(error, setError, camposDeConfirmacion))
    }
  }

  return (
    <form onSubmit={handleSubmit(confirmar)} noValidate className={marco}>
      <p className="text-sm text-slate-700">
        Entregue {textoDePaquetes(ids.length)} a {nombreDelCliente(visita.cliente)}.
      </p>
      {conCobro && (
        <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-900">
            Cobrar contra entrega: {formatearDolares(cobro.totalUsd)}
            {moneda === 'NIO' && tipoDeCambio !== null && ` = ${formatearCordobas(cobroEnCordobas(cobro.facturas, tipoDeCambio))}`}
            <span className="font-normal"> ({cobro.facturas.map((factura) => factura.numeroFactura).join(', ')})</span>
          </p>
          <fieldset>
            <legend className="text-sm font-medium text-slate-700">Moneda</legend>
            <div className="mt-1 flex flex-wrap gap-4">
              {(['USD', 'NIO'] as const).map((opcion) => (
                <label key={opcion} className="flex items-center gap-2 text-sm has-disabled:opacity-60">
                  <input
                    type="radio"
                    value={opcion}
                    disabled={opcion === 'NIO' && vigente.data === null}
                    className="size-4 accent-blue-700"
                    {...register('moneda')}
                  />
                  {opcion === 'USD' ? 'Dólares (USD)' : 'Córdobas (C$)'}
                </label>
              ))}
            </div>
            {vigente.data === null ? (
              <p className="mt-1 text-xs text-slate-600">No hay un tipo de cambio vigente: solo se puede cobrar en dólares.</p>
            ) : vigente.isError ? (
              <p className="mt-1 text-xs text-slate-600">
                En córdobas se cobra el equivalente exacto al tipo de cambio de hoy; el sistema lo calcula al confirmar.
              </p>
            ) : (
              tipoDeCambio !== null && (
                <p className="mt-1 text-xs text-slate-600">Tipo de cambio de hoy: {formatearNumero(tipoDeCambio, 4, 4)} córdobas por dólar.</p>
              )
            )}
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <Seleccion etiqueta="Método de pago" error={errors.metodoPago?.message} {...register('metodoPago')}>
              <option value="">Elija…</option>
              {metodosDePago.map((metodo) => (
                <option key={metodo} value={metodo}>
                  {nombresDeMetodoDePago[metodo]}
                </option>
              ))}
            </Seleccion>
            <Campo etiqueta="Referencia (opcional)" autoComplete="off" error={errors.referencia?.message} {...register('referencia')} />
          </div>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Quién recibe" autoComplete="off" error={errors.personaRecibe?.message} {...register('personaRecibe')} />
        <Campo
          etiqueta="Fecha y hora (opcional)"
          type="datetime-local"
          max={maximo}
          ayuda="Vacía: ahora. Solo si se registra después."
          error={errors.fecha?.message}
          {...register('fecha')}
        />
      </div>
      {errorGeneral && <Aviso tipo="error">{errorGeneral}</Aviso>}
      <div className="flex flex-wrap gap-3">
        <Boton type="submit" cargando={isSubmitting}>
          {conCobro ? 'Cobrar y confirmar entrega' : 'Confirmar entrega'}
        </Boton>
        <Boton variante="secundario" disabled={isSubmitting} onClick={alVolver}>
          Volver
        </Boton>
      </div>
    </form>
  )
}

/** EN_RUTA → FALLIDA: los paquetes vuelven a Listo para entrega y se pueden reprogramar. */
export function MarcarFallida({ visita, alTerminar, alVolver }: Props) {
  const ids = visita.entregas.map((entrega) => entrega.id)
  const fallo = useMutation({ mutationFn: (motivo: string) => marcarFallida(ids, motivo) })
  return (
    <ConfirmacionConMotivo
      mensaje={`¿No se pudo entregar a ${nombreDelCliente(visita.cliente)}? Sus ${textoDePaquetes(ids.length)} vuelven a la agencia como Listo para entrega y se pueden programar de nuevo.`}
      esquema={esquemaMotivo}
      textoConfirmar="Marcar como fallida"
      alConfirmar={async (motivo) => {
        await fallo.mutateAsync(motivo)
        await alTerminar(`Entrega fallida: ${textoDePaquetes(ids.length)} de ${nombreDelCliente(visita.cliente)} vuelven a la agencia.`)
      }}
      alVolver={alVolver}
    />
  )
}

/** PENDIENTE → CANCELADA: el delivery no sale; los paquetes siguen Listo para entrega. */
export function CancelarEntregas({ visita, alTerminar, alVolver }: Props) {
  const ids = visita.entregas.map((entrega) => entrega.id)
  const cancelacion = useMutation({ mutationFn: (motivo: string) => cancelarEntregas(ids, motivo) })
  return (
    <ConfirmacionConMotivo
      mensaje={`¿Cancelar el delivery de ${textoDePaquetes(ids.length)} de ${nombreDelCliente(visita.cliente)}? Los paquetes siguen listos para entrega.`}
      esquema={esquemaMotivo}
      textoConfirmar="Sí, cancelar delivery"
      alConfirmar={async (motivo) => {
        await cancelacion.mutateAsync(motivo)
        await alTerminar(`Delivery cancelado: ${textoDePaquetes(ids.length)} de ${nombreDelCliente(visita.cliente)}.`)
      }}
      alVolver={alVolver}
    />
  )
}
