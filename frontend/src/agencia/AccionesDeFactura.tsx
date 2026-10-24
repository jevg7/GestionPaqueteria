import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { Campo } from '../components/Campo.tsx'
import { ConfirmacionConMotivo } from '../components/ConfirmacionConMotivo.tsx'
import { Seleccion } from '../components/Seleccion.tsx'
import { cocienteRedondeado, restaDeMontos } from '../lib/dinero.ts'
import { mensajeDeError } from '../lib/errores.ts'
import { formatearCordobas, formatearDia, formatearDolares, formatearNumero } from '../lib/formato.ts'
import { mensajeDelEnvio } from '../lib/formularios.ts'
import {
  anularFactura,
  anularPago,
  camposDePago,
  esquemaAnulacion,
  esquemaPago,
  metodosDePago,
  montoDelPago,
  nombresDeMetodoDePago,
  registrarPago,
  saldoEnMoneda,
  textoDelPago,
  type DatosPago,
  type Factura,
  type FormularioPago,
  type Moneda,
  type Pago,
} from './facturas.ts'
import { opcionesTipoDeCambioVigente } from './tiposDeCambio.ts'

// Las acciones de la ficha de la factura. Cada una muestra su formulario en la página; "Volver" la cierra sin cambios.

type Props = {
  factura: Factura
  /** Cuando la API ya aceptó el cambio: refresca la factura y muestra el aviso. */
  alTerminar: (aviso: string) => Promise<void>
  alVolver: () => void
}

const marco = 'space-y-4 rounded-xl border border-slate-200 bg-white p-4'

/**
 * Registra un pago en dólares o en córdobas. Llega con el saldo completo; en córdobas, con su equivalente exacto al tipo
 * de cambio vigente, y muestra cuánto abona en dólares lo que se escriba.
 */
export function RegistrarPago({ factura, alTerminar, alVolver }: Props) {
  const vigente = useQuery(opcionesTipoDeCambioVigente)
  const tipoDeCambio = vigente.data?.nioPorUsd ?? null
  const esquema = useMemo(() => esquemaPago(factura.saldo, tipoDeCambio), [factura.saldo, tipoDeCambio])
  const [errorGeneral, setErrorGeneral] = useState<string>()
  const {
    register,
    handleSubmit,
    control,
    getValues,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormularioPago, unknown, DatosPago>({
    resolver: zodResolver(esquema),
    defaultValues: { moneda: 'USD', monto: factura.saldo.toFixed(2), metodoPago: '', referencia: '' },
  })
  const moneda = useWatch({ control, name: 'moneda' })
  const montoEscrito = montoDelPago.safeParse(useWatch({ control, name: 'monto' }))
  const registro = useMutation({ mutationFn: (pago: DatosPago) => registrarPago(factura.id, pago) })
  const saldoCompleto = (enMoneda: Moneda) => saldoEnMoneda(factura.saldo, enMoneda, tipoDeCambio).toFixed(2)

  const pagar = async (datos: DatosPago) => {
    setErrorGeneral(undefined)
    try {
      const pago = await registro.mutateAsync(datos)
      const saldo = restaDeMontos(factura.saldo, pago.monto)
      await alTerminar(
        saldo === 0
          ? `Pago de ${textoDelPago(pago)} registrado. La factura quedó pagada: sus paquetes pendientes de pago pasan a Pagado.`
          : `Pago de ${textoDelPago(pago)} registrado. Queda un saldo de ${formatearDolares(saldo)}.`,
      )
    } catch (error) {
      // 409: el saldo cambió mientras tanto (otro pago), la factura se anuló o no hay tipo de cambio.
      setErrorGeneral(mensajeDelEnvio(error, setError, camposDePago))
    }
  }

  return (
    <form onSubmit={handleSubmit(pagar)} noValidate className={marco}>
      <p className="text-sm text-slate-700">
        Saldo: <strong>{formatearDolares(factura.saldo)}</strong>
        {tipoDeCambio !== null && vigente.data && (
          <>
            {' '}
            = {formatearCordobas(saldoEnMoneda(factura.saldo, 'NIO', tipoDeCambio))} al tipo de cambio{' '}
            {formatearNumero(tipoDeCambio, 4, 4)} del {formatearDia(vigente.data.fecha)}
          </>
        )}
        .
      </p>

      <fieldset>
        <legend className="text-sm font-medium text-slate-700">Moneda</legend>
        <div className="mt-1 flex flex-wrap gap-4">
          {(['USD', 'NIO'] as const).map((opcion) => (
            <label key={opcion} className="flex items-center gap-2 text-sm has-disabled:opacity-60">
              <input
                type="radio"
                value={opcion}
                disabled={opcion === 'NIO' && tipoDeCambio === null}
                className="size-4 accent-blue-700"
                {...register('moneda', {
                  // Si el monto seguía siendo el saldo completo, pasa al saldo completo en la otra moneda.
                  onChange: (evento: { target: { value: Moneda } }) => {
                    if (getValues('monto') === saldoCompleto(moneda)) setValue('monto', saldoCompleto(evento.target.value))
                  },
                })}
              />
              {opcion === 'USD' ? 'Dólares (USD)' : 'Córdobas (C$)'}
            </label>
          ))}
        </div>
        {vigente.isPending ? (
          <p className="mt-1 text-xs text-slate-500">Consultando el tipo de cambio…</p>
        ) : vigente.isError ? (
          <p className="mt-1 text-sm text-red-700">No se pudo leer el tipo de cambio: {mensajeDeError(vigente.error)}</p>
        ) : (
          tipoDeCambio === null && (
            <p className="mt-1 text-xs text-slate-500">
              No hay un tipo de cambio vigente: para recibir córdobas, el administrador debe registrarlo.
            </p>
          )
        )}
        {errors.moneda?.message && <p className="mt-1 text-sm text-red-700">{errors.moneda.message}</p>}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Campo
            etiqueta={moneda === 'NIO' ? 'Monto (C$)' : 'Monto (USD)'}
            inputMode="decimal"
            autoComplete="off"
            error={errors.monto?.message}
            {...register('monto')}
          />
          {moneda === 'NIO' && tipoDeCambio !== null && montoEscrito.success && (
            <p className="mt-1 text-sm text-slate-600">Abona {formatearDolares(cocienteRedondeado(montoEscrito.data, tipoDeCambio))}.</p>
          )}
          <button
            type="button"
            onClick={() => setValue('monto', saldoCompleto(moneda), { shouldValidate: true })}
            className="mt-1 text-sm font-medium text-blue-700 hover:underline"
          >
            Saldo completo
          </button>
        </div>
        <Seleccion etiqueta="Método de pago" error={errors.metodoPago?.message} {...register('metodoPago')}>
          <option value="">Elija…</option>
          {metodosDePago.map((metodo) => (
            <option key={metodo} value={metodo}>
              {nombresDeMetodoDePago[metodo]}
            </option>
          ))}
        </Seleccion>
      </div>
      <Campo
        etiqueta="Referencia (opcional)"
        autoComplete="off"
        ayuda="Número de transferencia o de voucher."
        error={errors.referencia?.message}
        {...register('referencia')}
      />
      {errorGeneral && <Aviso tipo="error">{errorGeneral}</Aviso>}
      <div className="flex flex-wrap gap-3">
        <Boton type="submit" cargando={isSubmitting}>
          Registrar pago
        </Boton>
        <Boton variante="secundario" disabled={isSubmitting} onClick={alVolver}>
          Volver
        </Boton>
      </div>
    </form>
  )
}

/** EMITIDA → ANULADA, con motivo y solo sin pagos aplicados (solo ADMIN). Sus paquetes se pueden volver a facturar. */
export function AnularFactura({ factura, alTerminar, alVolver }: Props) {
  const anulacion = useMutation({ mutationFn: (motivo: string) => anularFactura(factura.id, motivo) })
  return (
    <ConfirmacionConMotivo
      mensaje={`¿Anular la factura ${factura.numeroFactura}? Queda como comprobante anulado y sus paquetes podrán facturarse de nuevo. No se puede deshacer.`}
      esquema={esquemaAnulacion}
      textoConfirmar="Sí, anular factura"
      alConfirmar={async (motivo) => {
        await anulacion.mutateAsync(motivo)
        await alTerminar(`Factura ${factura.numeroFactura} anulada. Sus paquetes pueden facturarse de nuevo.`)
      }}
      alVolver={alVolver}
    />
  )
}

/** APLICADO → ANULADO, con motivo (solo ADMIN). Si la factura estaba pagada, sus paquetes pagados vuelven a pendientes. */
export function AnularPago({ factura, pago, alTerminar, alVolver }: Props & { pago: Pago }) {
  const anulacion = useMutation({ mutationFn: (motivo: string) => anularPago(pago.id, motivo) })
  const estabaPagada = factura.saldo === 0
  return (
    <ConfirmacionConMotivo
      mensaje={
        `¿Anular el pago de ${textoDelPago(pago)}? Deja de contar para el saldo de la factura.` +
        (estabaPagada ? ' La factura dejará de estar pagada: sus paquetes pagados vuelven a Pendiente de pago.' : '') +
        ' No se puede deshacer.'
      }
      esquema={esquemaAnulacion}
      textoConfirmar="Sí, anular pago"
      alConfirmar={async (motivo) => {
        await anulacion.mutateAsync(motivo)
        await alTerminar(
          estabaPagada
            ? 'Pago anulado. La factura ya no está pagada: sus paquetes pagados vuelven a Pendiente de pago.'
            : 'Pago anulado.',
        )
      }}
      alVolver={alVolver}
    />
  )
}

