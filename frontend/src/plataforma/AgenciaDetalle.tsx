import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { EnlaceBoton } from '../components/EnlaceBoton.tsx'
import { mensajeDeError } from '../lib/api.ts'
import { formatearFechaHora } from '../lib/formato.ts'
import { claveAgencias, reactivarAgencia, suspenderAgencia, type Agencia } from './agencias.ts'
import { ConAgencia } from './ConAgencia.tsx'
import { EtiquetaEstadoAgencia } from './EtiquetaEstadoAgencia.tsx'

/** Lo que trae la navegación: un aviso para mostrar y los filtros de la lista de la que se vino. */
type EstadoDeNavegacion = { aviso?: string; lista?: string } | null

export function AgenciaDetalle() {
  const navegacion = useLocation().state as EstadoDeNavegacion
  return (
    <ConAgencia volver={`/plataforma/agencias${navegacion?.lista ?? ''}`}>
      {(agencia) => <Detalle agencia={agencia} navegacion={navegacion} />}
    </ConAgencia>
  )
}

function Detalle({ agencia, navegacion }: { agencia: Agencia; navegacion: EstadoDeNavegacion }) {
  const queryClient = useQueryClient()
  const [aviso, setAviso] = useState(navegacion?.aviso)
  const [confirmando, setConfirmando] = useState(false)
  const suspender = agencia.estado === 'ACTIVA'
  const cambioDeEstado = useMutation({
    mutationFn: (suspenderla: boolean) => (suspenderla ? suspenderAgencia(agencia.id) : reactivarAgencia(agencia.id)),
    onSuccess: async (_, suspenderla) => {
      await queryClient.invalidateQueries({ queryKey: claveAgencias })
      setConfirmando(false)
      setAviso(
        suspenderla
          ? 'Agencia suspendida: sus usuarios ya no pueden entrar.'
          : 'Agencia reactivada: sus usuarios activos pueden volver a entrar.',
      )
    },
  })

  return (
    <section className="max-w-2xl">
      <Link to={`/plataforma/agencias${navegacion?.lista ?? ''}`} className="text-sm font-medium text-blue-700 hover:underline">
        ← Agencias
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{agencia.nombre}</h1>
        <EtiquetaEstadoAgencia estado={agencia.estado} />
      </div>
      {aviso && (
        <div className="mt-4">
          <Aviso tipo="exito">{aviso}</Aviso>
        </div>
      )}

      <dl className="mt-6 grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 sm:p-6">
        <Dato nombre="RUC" valor={agencia.ruc} />
        <Dato nombre="Teléfono" valor={agencia.telefono} />
        <Dato nombre="Correo de contacto" valor={agencia.correoContacto} />
        <Dato nombre="Creada" valor={formatearFechaHora(agencia.creadoEn)} />
        <Dato nombre="Última modificación" valor={formatearFechaHora(agencia.actualizadoEn)} />
      </dl>

      <div className="mt-6 flex flex-wrap gap-3">
        <EnlaceBoton to="editar" state={{ lista: navegacion?.lista }} variante="secundario">
          Editar datos
        </EnlaceBoton>
        {!confirmando && (
          <Boton
            variante={suspender ? 'peligro' : 'primario'}
            onClick={() => {
              setAviso(undefined)
              setConfirmando(true)
            }}
          >
            {suspender ? 'Suspender agencia' : 'Reactivar agencia'}
          </Boton>
        )}
      </div>

      {confirmando && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-700">
            {suspender
              ? `¿Suspender ${agencia.nombre}? Sus usuarios perderán el acceso desde su siguiente acción. Los datos se conservan y la agencia se puede reactivar cuando quiera.`
              : `¿Reactivar ${agencia.nombre}? Sus usuarios activos podrán volver a entrar.`}
          </p>
          {cambioDeEstado.isError && (
            <div className="mt-3">
              <Aviso tipo="error">{mensajeDeError(cambioDeEstado.error)}</Aviso>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <Boton
              variante={suspender ? 'peligro' : 'primario'}
              cargando={cambioDeEstado.isPending}
              onClick={() => cambioDeEstado.mutate(suspender)}
            >
              {suspender ? 'Sí, suspender' : 'Sí, reactivar'}
            </Boton>
            <Boton
              variante="secundario"
              disabled={cambioDeEstado.isPending}
              onClick={() => {
                cambioDeEstado.reset()
                setConfirmando(false)
              }}
            >
              Cancelar
            </Boton>
          </div>
        </div>
      )}
    </section>
  )
}

function Dato({ nombre, valor }: { nombre: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{nombre}</dt>
      <dd className="mt-1 break-words text-sm">{valor ?? '—'}</dd>
    </div>
  )
}
