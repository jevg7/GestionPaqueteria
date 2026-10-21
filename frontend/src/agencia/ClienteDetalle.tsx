import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { usePermiso } from '../auth/identidad.ts'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { Confirmacion } from '../components/Confirmacion.tsx'
import { Dato } from '../components/Dato.tsx'
import { EnlaceBoton } from '../components/EnlaceBoton.tsx'
import { EtiquetaActivo } from '../components/Etiqueta.tsx'
import { mensajeDeError } from '../lib/errores.ts'
import { formatearFechaHora } from '../lib/formato.ts'
import { activarCliente, claveClientes, desactivarCliente, nombreDelCliente, type Cliente } from './clientes.ts'
import { ConCliente } from './ConCliente.tsx'

/** Lo que trae la navegación: un aviso para mostrar y los filtros de la lista de la que se vino. */
type EstadoDeNavegacion = { aviso?: string; lista?: string } | null

export function ClienteDetalle() {
  const navegacion = useLocation().state as EstadoDeNavegacion
  return (
    <ConCliente volver={`/clientes${navegacion?.lista ?? ''}`}>
      {(cliente) => <Detalle cliente={cliente} navegacion={navegacion} />}
    </ConCliente>
  )
}

function Detalle({ cliente, navegacion }: { cliente: Cliente; navegacion: EstadoDeNavegacion }) {
  const puedeModificar = usePermiso('EscribirClientes')
  const nombre = nombreDelCliente(cliente)
  const queryClient = useQueryClient()
  const [aviso, setAviso] = useState(navegacion?.aviso)
  const [confirmando, setConfirmando] = useState(false)
  const desactivar = cliente.activo

  const cambioDeEstado = useMutation({
    mutationFn: (desactivarlo: boolean) => (desactivarlo ? desactivarCliente(cliente.id) : activarCliente(cliente.id)),
    onSuccess: async (_, desactivarlo) => {
      await queryClient.invalidateQueries({ queryKey: claveClientes })
      setConfirmando(false)
      setAviso(
        desactivarlo
          ? `${nombre} quedó inactivo: ya no se le pueden registrar paquetes.`
          : `${nombre} está activo: se le pueden registrar paquetes otra vez.`,
      )
    },
  })

  return (
    <section className="max-w-2xl">
      <Link to={`/clientes${navegacion?.lista ?? ''}`} className="text-sm font-medium text-blue-700 hover:underline">
        ← Clientes
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{nombre}</h1>
        <EtiquetaActivo activo={cliente.activo} />
      </div>
      <p className="mt-1 font-mono text-sm text-slate-600">{cliente.codigoCliente}</p>
      {aviso && (
        <div className="mt-4">
          <Aviso tipo="exito">{aviso}</Aviso>
        </div>
      )}

      <dl className="mt-6 grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 sm:p-6">
        <Dato nombre="Teléfono" valor={cliente.telefono} />
        <Dato nombre="Correo" valor={cliente.correo} />
        <Dato nombre="Dirección" valor={cliente.direccion} ancho />
        <Dato nombre="Registrado" valor={formatearFechaHora(cliente.fechaRegistro)} />
        <Dato nombre="Última modificación" valor={formatearFechaHora(cliente.actualizadoEn)} />
      </dl>

      {puedeModificar && (
        <div className="mt-6 flex flex-wrap gap-3">
          <EnlaceBoton to="editar" state={{ lista: navegacion?.lista }} variante="secundario">
            Editar datos
          </EnlaceBoton>
          {!confirmando && (
            <Boton
              variante={desactivar ? 'peligro' : 'primario'}
              onClick={() => {
                setAviso(undefined)
                setConfirmando(true)
              }}
            >
              {desactivar ? 'Desactivar cliente' : 'Activar cliente'}
            </Boton>
          )}
        </div>
      )}
      {!cliente.activo && (
        <p className="mt-3 text-xs text-slate-500">
          Un cliente inactivo no recibe paquetes nuevos; los que tiene en curso siguen su flujo.
        </p>
      )}

      {confirmando && (
        <div className="mt-4">
          <Confirmacion
            mensaje={
              desactivar
                ? `¿Desactivar a ${nombre}? Ya no se le podrán registrar paquetes nuevos; los que tiene en curso siguen su flujo. Se puede volver a activar.`
                : `¿Activar a ${nombre}? Se le podrán registrar paquetes otra vez.`
            }
            textoConfirmar={desactivar ? 'Sí, desactivar' : 'Sí, activar'}
            variante={desactivar ? 'peligro' : 'primario'}
            cargando={cambioDeEstado.isPending}
            error={cambioDeEstado.isError ? mensajeDeError(cambioDeEstado.error) : undefined}
            alConfirmar={() => cambioDeEstado.mutate(desactivar)}
            alCancelar={() => {
              cambioDeEstado.reset()
              setConfirmando(false)
            }}
          />
        </div>
      )}
    </section>
  )
}
