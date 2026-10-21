import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useIdentidadActual } from '../auth/identidad.ts'
import { tieneAlgunRol } from '../auth/secciones.ts'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { Campo } from '../components/Campo.tsx'
import { Etiqueta } from '../components/Etiqueta.tsx'
import { mensajeDeError } from '../lib/errores.ts'
import { formatearDia, formatearFechaHora, hoyEnManagua } from '../lib/formato.ts'
import { mensajeDelEnvio } from '../lib/formularios.ts'
import {
  camposDeTipoDeCambio,
  claveTiposDeCambio,
  esquemaTipoDeCambio,
  opcionesTipoDeCambioVigente,
  opcionesUltimosTiposDeCambio,
  registrarTipoDeCambio,
  textoTipoDeCambio,
  type DatosTipoDeCambio,
  type FormularioTipoDeCambio,
  type TipoDeCambio as Registro,
} from './tiposDeCambio.ts'

/** Tipo de cambio (córdobas por dólar): consultan ADMIN y AGENTE; registra y corrige solo el ADMIN. */
export function TipoDeCambio() {
  const esAdmin = tieneAlgunRol(useIdentidadActual().roles, ['ADMIN'])
  // "Hoy" es el de Managua, como en el backend.
  const hoy = useMemo(() => hoyEnManagua(), [])
  const vigente = useQuery(opcionesTipoDeCambioVigente)
  const ultimos = useQuery(opcionesUltimosTiposDeCambio)

  return (
    <section className="max-w-3xl">
      <h1 className="text-xl font-semibold">Tipo de cambio</h1>
      <p className="mt-1 text-sm text-slate-600">
        Córdobas por dólar, para cobrar en córdobas. Cada pago guarda el tipo de cambio con que se registró.
      </p>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-medium text-slate-500">Vigente hoy</p>
        {vigente.isPending ? (
          <p className="mt-1 text-sm text-slate-500">Cargando…</p>
        ) : vigente.isError ? (
          <div className="mt-2">
            <Aviso tipo="error">{mensajeDeError(vigente.error)}</Aviso>
          </div>
        ) : vigente.data ? (
          <>
            <p className="mt-1 text-lg font-semibold">{textoTipoDeCambio(vigente.data)}</p>
            <p className="text-sm text-slate-500">
              Del {formatearDia(vigente.data.fecha)}
              {vigente.data.fecha < hoy && ' (hoy no hay registro: se usa el último)'}
            </p>
          </>
        ) : (
          <div className="mt-2">
            <Aviso tipo="advertencia">No hay tipo de cambio registrado: no se pueden recibir pagos en córdobas.</Aviso>
          </div>
        )}
      </div>

      {esAdmin && <Formulario hoy={hoy} registrados={ultimos.data ?? []} />}

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">Últimos registros</h2>
      <div className="mt-2">
        {ultimos.isPending ? (
          <p className="text-sm text-slate-500">Cargando…</p>
        ) : ultimos.isError ? (
          <div className="space-y-3">
            <Aviso tipo="error">{mensajeDeError(ultimos.error)}</Aviso>
            <Boton variante="secundario" cargando={ultimos.isFetching} onClick={() => void ultimos.refetch()}>
              Reintentar
            </Boton>
          </div>
        ) : ultimos.data.length === 0 ? (
          <p className="text-sm text-slate-600">Todavía no hay registros.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {ultimos.data.map((registro) => (
              <li key={registro.fecha} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <p className="font-medium">{formatearDia(registro.fecha)}</p>
                  <p className="text-xs text-slate-500">Actualizado el {formatearFechaHora(registro.actualizadoEn)}</p>
                </div>
                <div className="flex items-center gap-3">
                  {registro.fecha === vigente.data?.fecha && <Etiqueta tono="verde">Vigente</Etiqueta>}
                  {registro.fecha > hoy && <Etiqueta tono="azul">Próximo</Etiqueta>}
                  <span className="text-sm">{textoTipoDeCambio(registro)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function Formulario({ hoy, registrados }: { hoy: string; registrados: Registro[] }) {
  const queryClient = useQueryClient()
  const [aviso, setAviso] = useState<string>()
  const [errorGeneral, setErrorGeneral] = useState<string>()
  const formulario = useForm<FormularioTipoDeCambio, unknown, DatosTipoDeCambio>({
    resolver: zodResolver(esquemaTipoDeCambio),
    defaultValues: { fecha: hoy, nioPorUsd: '' },
  })
  const {
    register,
    handleSubmit,
    setError,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = formulario
  const registro = useMutation({ mutationFn: registrarTipoDeCambio })
  // Si el día ya tiene tipo de cambio, guardar lo corrige (el PUT reemplaza el valor de ese día).
  const fecha = useWatch({ control, name: 'fecha' })
  const existente = registrados.find((tipo) => tipo.fecha === fecha)

  const guardar = async (datos: DatosTipoDeCambio) => {
    setAviso(undefined)
    setErrorGeneral(undefined)
    try {
      const guardado = await registro.mutateAsync(datos)
      await queryClient.invalidateQueries({ queryKey: claveTiposDeCambio })
      setAviso(`Tipo de cambio del ${formatearDia(guardado.fecha)} guardado: ${textoTipoDeCambio(guardado)}.`)
      reset({ fecha: hoy, nioPorUsd: '' })
    } catch (error) {
      setErrorGeneral(mensajeDelEnvio(error, setError, camposDeTipoDeCambio))
    }
  }

  return (
    <form onSubmit={handleSubmit(guardar)} noValidate className="mt-6 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
      <h2 className="text-sm font-semibold">Registrar o corregir</h2>
      <p className="mt-1 text-xs text-slate-500">
        Puede adelantar días (el BCN publica la tabla del mes). Corregir un día no cambia los pagos ya registrados.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Campo
          etiqueta="Día"
          type="date"
          ayuda={existente ? `Ese día ya tiene ${textoTipoDeCambio(existente)}: se reemplazará.` : undefined}
          error={errors.fecha?.message}
          {...register('fecha')}
        />
        <Campo
          etiqueta="Córdobas por dólar"
          inputMode="decimal"
          placeholder="36.6243"
          error={errors.nioPorUsd?.message}
          {...register('nioPorUsd')}
        />
      </div>
      {(aviso || errorGeneral) && (
        <div className="mt-4">
          {aviso && <Aviso tipo="exito">{aviso}</Aviso>}
          {errorGeneral && <Aviso tipo="error">{errorGeneral}</Aviso>}
        </div>
      )}
      <div className="mt-4">
        <Boton type="submit" cargando={isSubmitting}>
          {existente ? 'Corregir' : 'Guardar'}
        </Boton>
      </div>
    </form>
  )
}
