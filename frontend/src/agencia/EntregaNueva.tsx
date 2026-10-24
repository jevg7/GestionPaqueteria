import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { usePermiso } from '../auth/identidad.ts'
import { AreaDeTexto } from '../components/AreaDeTexto.tsx'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { Campo } from '../components/Campo.tsx'
import { EnlaceBoton } from '../components/EnlaceBoton.tsx'
import { Seleccion } from '../components/Seleccion.tsx'
import { sumaDeMontos } from '../lib/dinero.ts'
import { mensajeDeError } from '../lib/errores.ts'
import { fechaHoraEnManagua, formatearDolares } from '../lib/formato.ts'
import { mensajeDelEnvio } from '../lib/formularios.ts'
import { nombreDelCliente, opcionesCliente, referenciaDe, type ReferenciaCliente } from './clientes.ts'
import {
  camposDeDelivery,
  camposDeRetiro,
  claveEntregas,
  esquemaDelivery,
  esquemaRetiro,
  opcionesEntregasPorSalirDelCliente,
  opcionesPaquetesListosDelCliente,
  opcionesRepartidores,
  programarDelivery,
  registrarRetiro,
  type DatosDelivery,
  type DatosRetiro,
  type FormularioDelivery,
  type FormularioRetiro,
  type TipoEntrega,
} from './entregas.ts'
import { facturadosEn, opcionesFacturasConSaldo, type Factura } from './facturas.ts'
import { clavePaquetes } from './paquetes.ts'
import { SelectorDeCliente } from './SelectorDeCliente.tsx'
import { nombreDelUsuario } from './usuarios.ts'

const ENTREGAS = '/entregas'

/** Retiro en agencia o delivery de los paquetes listos de un cliente. Con ?cliente=<id> llega con el cliente elegido. */
export function EntregaNueva() {
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
      <Link to={ENTREGAS} className="text-sm font-medium text-blue-700 hover:underline">
        ← Entregas
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Programar entrega</h1>
      <p className="mt-1 text-sm text-slate-600">
        Retiro en agencia (el cliente se lleva sus paquetes ya pagados) o delivery a domicilio (si queda saldo, se cobra al
        entregar).
      </p>
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
        <SelectorDeCliente valor={cliente} alCambiar={setCliente} soloActivos={false} />
      </div>
      {/* key: al cambiar de cliente, la selección empieza de nuevo. */}
      {cliente ? (
        <PaquetesParaEntregar key={cliente.id} cliente={cliente} />
      ) : (
        <div className="mt-6">
          <EnlaceBoton to={ENTREGAS} variante="secundario">
            Cancelar
          </EnlaceBoton>
        </div>
      )}
    </section>
  )
}

function PaquetesParaEntregar({ cliente }: { cliente: ReferenciaCliente }) {
  const [listos, porSalir, conSaldo, datosDelCliente] = useQueries({
    queries: [
      opcionesPaquetesListosDelCliente(cliente.id),
      opcionesEntregasPorSalirDelCliente(cliente.id),
      opcionesFacturasConSaldo(cliente.id),
      opcionesCliente(cliente.id),
    ],
  })
  const facturaDe = useMemo(() => facturadosEn(conSaldo.data ?? []), [conSaldo.data])
  // Un paquete con un delivery por salir ya tiene su intento vigente: no se programa otro.
  const programados = new Set(porSalir.data?.items.map((entrega) => entrega.paquete.id))
  const paquetes = listos.data?.items ?? []
  const disponibles = paquetes.filter((paquete) => !programados.has(paquete.id))
  const yaProgramados = paquetes.filter((paquete) => programados.has(paquete.id))
  const [excluidos, setExcluidos] = useState<ReadonlySet<number>>(new Set())
  const [tipo, setTipo] = useState<TipoEntrega>('RETIRO_EN_AGENCIA')
  const elegidos = disponibles.filter((paquete) => !excluidos.has(paquete.id))
  // Las facturas con saldo de los elegidos, cada una una vez.
  const porCobrar = [...new Map(elegidos.flatMap((paquete) => {
    const factura = facturaDe.get(paquete.id)
    return factura ? [[factura.id, factura] as const] : []
  })).values()]

  const alternar = (id: number, incluir: boolean) =>
    setExcluidos((actuales) => {
      const nuevos = new Set(actuales)
      if (incluir) nuevos.delete(id)
      else nuevos.add(id)
      return nuevos
    })

  const consultas = [listos, porSalir, conSaldo, datosDelCliente]
  if (consultas.some((consulta) => consulta.isPending)) return <p className="mt-6 text-sm text-slate-500">Cargando sus paquetes…</p>
  const fallida = consultas.find((consulta) => consulta.isError)
  if (fallida || !datosDelCliente.data) {
    return (
      <div className="mt-6 space-y-3">
        <Aviso tipo="error">{mensajeDeError(fallida?.error)}</Aviso>
        <Boton variante="secundario" onClick={() => consultas.forEach((consulta) => void consulta.refetch())}>
          Reintentar
        </Boton>
      </div>
    )
  }

  return (
    <div className="mt-6 space-y-6">
      <section aria-labelledby="titulo-listos">
        <h2 id="titulo-listos" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Listos para entregar
        </h2>
        {disponibles.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">
            {nombreDelCliente(cliente)} no tiene paquetes listos para entregar. Un paquete pagado o facturado queda listo desde
            su ficha (Preparar para entrega).
          </p>
        ) : (
          <ul aria-label="Paquetes para entregar" className="mt-2 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {disponibles.map((paquete) => {
              const factura = facturaDe.get(paquete.id)
              return (
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
                      <span className={`block ${factura ? 'text-amber-900' : 'text-green-800'}`}>
                        {factura ? `Por cobrar: ${factura.numeroFactura} tiene un saldo de ${formatearDolares(factura.saldo)}` : 'Pagado'}
                      </span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
        {yaProgramados.length > 0 && (
          <p className="mt-2 text-sm text-slate-600">
            Ya tienen un delivery por salir: {yaProgramados.map((paquete) => paquete.codigoPaquete).join(', ')} (en{' '}
            <Link to={ENTREGAS} className="font-medium text-blue-700 hover:underline">
              Entregas
            </Link>
            ).
          </p>
        )}
      </section>

      {disponibles.length > 0 && (
        <>
          <fieldset>
            <legend className="text-sm font-semibold uppercase tracking-wide text-slate-500">Cómo se entrega</legend>
            <div className="mt-2 flex flex-wrap gap-4">
              {(
                [
                  ['RETIRO_EN_AGENCIA', 'Retiro en agencia'],
                  ['DELIVERY', 'Delivery a domicilio'],
                ] as const
              ).map(([valor, texto]) => (
                <label key={valor} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="tipo-de-entrega"
                    checked={tipo === valor}
                    onChange={() => setTipo(valor)}
                    className="size-4 accent-blue-700"
                  />
                  {texto}
                </label>
              ))}
            </div>
          </fieldset>
          {tipo === 'RETIRO_EN_AGENCIA' ? (
            <Retiro cliente={cliente} paqueteIds={elegidos.map((paquete) => paquete.id)} porCobrar={porCobrar} />
          ) : (
            <Delivery
              cliente={cliente}
              direccion={datosDelCliente.data.direccion ?? ''}
              paqueteIds={elegidos.map((paquete) => paquete.id)}
              porCobrar={porCobrar}
            />
          )}
        </>
      )}
    </div>
  )
}

type PropsDeEntrega = { cliente: ReferenciaCliente; paqueteIds: number[]; porCobrar: Factura[] }

const textoDePaquetes = (cantidad: number) => (cantidad === 1 ? '1 paquete' : `${cantidad} paquetes`)

/** Retiro en agencia: los paquetes quedan ENTREGADO. Exige sus facturas saldadas (si no, se cobra antes en caja). */
function Retiro({ cliente, paqueteIds, porCobrar }: PropsDeEntrega) {
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const maximo = useMemo(() => fechaHoraEnManagua(), [])
  const [errorGeneral, setErrorGeneral] = useState<string>()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormularioRetiro, unknown, DatosRetiro>({
    resolver: zodResolver(esquemaRetiro),
    defaultValues: { personaRecibe: nombreDelCliente(cliente), fecha: '', observaciones: '' },
  })
  const retiro = useMutation({ mutationFn: (datos: DatosRetiro) => registrarRetiro(paqueteIds, datos) })

  const registrar = async (datos: DatosRetiro) => {
    setErrorGeneral(undefined)
    try {
      const entregas = await retiro.mutateAsync(datos)
      void queryClient.invalidateQueries({ queryKey: claveEntregas })
      void queryClient.invalidateQueries({ queryKey: clavePaquetes })
      const entregados = `${textoDePaquetes(entregas.length)} ${entregas.length === 1 ? 'entregado' : 'entregados'}`
      navegar(ENTREGAS, { replace: true, state: { aviso: `Retiro registrado: ${entregados} a ${datos.personaRecibe}.` } })
    } catch (error) {
      // 409: una factura tiene saldo o un paquete ya no está listo (otro usuario se adelantó).
      setErrorGeneral(mensajeDelEnvio(error, setError, camposDeRetiro))
    }
  }

  return (
    <form onSubmit={handleSubmit(registrar)} noValidate className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
      {porCobrar.length > 0 && (
        <Aviso tipo="advertencia">
          Antes del retiro hay que cobrar en caja:{' '}
          {porCobrar.map((factura, indice) => (
            <span key={factura.id}>
              {indice > 0 && ', '}
              <Link to={`/facturas/${factura.id}`} className="font-medium underline">
                {factura.numeroFactura}
              </Link>{' '}
              (saldo {formatearDolares(factura.saldo)})
            </span>
          ))}
          .
        </Aviso>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
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
      <AreaDeTexto etiqueta="Observaciones (opcional)" rows={2} placeholder="Por ejemplo: retira su hermano, con cédula" {...register('observaciones')} />
      {errorGeneral && <Aviso tipo="error">{errorGeneral}</Aviso>}
      <div className="flex flex-wrap gap-3">
        <Boton type="submit" cargando={isSubmitting} disabled={paqueteIds.length === 0 || porCobrar.length > 0}>
          Registrar retiro
        </Boton>
        <EnlaceBoton to={ENTREGAS} variante="secundario">
          Cancelar
        </EnlaceBoton>
      </div>
    </form>
  )
}

/** Delivery a domicilio: queda por salir. El repartidor es opcional; lo elige el ADMIN (la lista de repartidores es suya). */
function Delivery({ cliente, direccion, paqueteIds, porCobrar }: PropsDeEntrega & { direccion: string }) {
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const eligeRepartidor = usePermiso('AdministrarUsuarios')
  const repartidores = useQuery({ ...opcionesRepartidores, enabled: eligeRepartidor })
  const [errorGeneral, setErrorGeneral] = useState<string>()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormularioDelivery, unknown, DatosDelivery>({
    resolver: zodResolver(esquemaDelivery),
    defaultValues: { direccion, fechaProgramada: '', responsableUsuarioId: '', observaciones: '' },
  })
  const programacion = useMutation({ mutationFn: (datos: DatosDelivery) => programarDelivery(paqueteIds, datos) })

  const programar = async (datos: DatosDelivery) => {
    setErrorGeneral(undefined)
    try {
      const entregas = await programacion.mutateAsync(datos)
      void queryClient.invalidateQueries({ queryKey: claveEntregas })
      const responsable = entregas[0]?.responsable
      navegar(ENTREGAS, {
        replace: true,
        state: {
          aviso: `Delivery programado para ${nombreDelCliente(cliente)}: ${textoDePaquetes(entregas.length)}${responsable ? ` con ${responsable.nombre}` : ', sin repartidor'}.`,
        },
      })
    } catch (error) {
      setErrorGeneral(mensajeDelEnvio(error, setError, camposDeDelivery))
    }
  }

  return (
    <form onSubmit={handleSubmit(programar)} noValidate className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
      {porCobrar.length > 0 && (
        <Aviso tipo="advertencia">
          Se cobrará contra entrega: {formatearDolares(sumaDeMontos(porCobrar.map((factura) => factura.saldo)))} (
          {porCobrar.map((factura) => factura.numeroFactura).join(', ')}).
        </Aviso>
      )}
      <AreaDeTexto
        etiqueta="Dirección de entrega"
        rows={2}
        ayuda={direccion ? 'La del cliente; cámbiela si se entrega en otro lugar.' : 'El cliente no tiene una dirección registrada.'}
        error={errors.direccion?.message}
        {...register('direccion')}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Fecha y hora programadas (opcional)" type="datetime-local" error={errors.fechaProgramada?.message} {...register('fechaProgramada')} />
        {eligeRepartidor ? (
          <Seleccion etiqueta="Repartidor (opcional)" error={errors.responsableUsuarioId?.message} {...register('responsableUsuarioId')}>
            <option value="">{repartidores.isPending ? 'Cargando…' : 'Sin asignar todavía'}</option>
            {repartidores.data?.map((repartidor) => (
              <option key={repartidor.id} value={repartidor.id}>
                {nombreDelUsuario(repartidor)}
              </option>
            ))}
          </Seleccion>
        ) : (
          <p className="self-end text-sm text-slate-500">Sin repartidor: un administrador lo asigna al salir a ruta.</p>
        )}
      </div>
      <AreaDeTexto etiqueta="Observaciones (opcional)" rows={2} {...register('observaciones')} />
      {errorGeneral && <Aviso tipo="error">{errorGeneral}</Aviso>}
      <div className="flex flex-wrap gap-3">
        <Boton type="submit" cargando={isSubmitting} disabled={paqueteIds.length === 0}>
          Programar delivery
        </Boton>
        <EnlaceBoton to={ENTREGAS} variante="secundario">
          Cancelar
        </EnlaceBoton>
      </div>
    </form>
  )
}
