import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useIdentidadActual } from '../auth/identidad.ts'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { Confirmacion } from '../components/Confirmacion.tsx'
import { Dato } from '../components/Dato.tsx'
import { EnlaceBoton } from '../components/EnlaceBoton.tsx'
import { mensajeDeError } from '../lib/errores.ts'
import { formatearFechaHora } from '../lib/formato.ts'
import { ConUsuario } from './ConUsuario.tsx'
import { EtiquetaActivo, EtiquetasDeRoles } from './EtiquetasDeUsuario.tsx'
import { activarUsuario, claveUsuarios, desactivarUsuario, nombreDelUsuario, reenviarInvitacion, type Usuario } from './usuarios.ts'

/** Lo que trae la navegación: un aviso para mostrar y los filtros de la lista de la que se vino. */
type EstadoDeNavegacion = { aviso?: string; lista?: string } | null

export function UsuarioDetalle() {
  const navegacion = useLocation().state as EstadoDeNavegacion
  return (
    <ConUsuario volver={`/usuarios${navegacion?.lista ?? ''}`}>
      {(usuario) => <Detalle usuario={usuario} navegacion={navegacion} />}
    </ConUsuario>
  )
}

function Detalle({ usuario, navegacion }: { usuario: Usuario; navegacion: EstadoDeNavegacion }) {
  const esUnoMismo = usuario.id === useIdentidadActual().id
  const nombre = nombreDelUsuario(usuario)
  const queryClient = useQueryClient()
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; texto: string } | undefined>(
    navegacion?.aviso ? { tipo: 'exito', texto: navegacion.aviso } : undefined,
  )
  const [confirmando, setConfirmando] = useState(false)
  const desactivar = usuario.activo

  const cambioDeEstado = useMutation({
    mutationFn: (desactivarlo: boolean) => (desactivarlo ? desactivarUsuario(usuario.id) : activarUsuario(usuario.id)),
    onSuccess: async (_, desactivarlo) => {
      await queryClient.invalidateQueries({ queryKey: claveUsuarios })
      setConfirmando(false)
      setAviso({ tipo: 'exito', texto: desactivarlo ? `${nombre} ya no puede entrar.` : `${nombre} puede volver a entrar.` })
    },
  })
  const reenvio = useMutation({
    mutationFn: () => reenviarInvitacion(usuario.id),
    onSuccess: () => setAviso({ tipo: 'exito', texto: `Se reenvió la invitación a ${usuario.correo}.` }),
    // 409 si ya la aceptó: la API lo explica (para recuperar el acceso se usa "olvidé mi contraseña").
    onError: (error) => setAviso({ tipo: 'error', texto: mensajeDeError(error) }),
  })

  return (
    <section className="max-w-2xl">
      <Link to={`/usuarios${navegacion?.lista ?? ''}`} className="text-sm font-medium text-blue-700 hover:underline">
        ← Usuarios
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{nombre}</h1>
        <EtiquetaActivo activo={usuario.activo} />
        {esUnoMismo && <span className="text-sm text-slate-500">(usted)</span>}
      </div>
      {aviso && (
        <div className="mt-4">
          <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>
        </div>
      )}

      <dl className="mt-6 grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 sm:p-6">
        <Dato nombre="Correo" valor={usuario.correo} />
        <Dato nombre="Teléfono" valor={usuario.telefono} />
        <Dato nombre="Roles" valor={<EtiquetasDeRoles roles={usuario.roles} />} ancho />
        <Dato nombre="Creado" valor={formatearFechaHora(usuario.creadoEn)} />
        <Dato nombre="Última modificación" valor={formatearFechaHora(usuario.actualizadoEn)} />
      </dl>

      <div className="mt-6 flex flex-wrap gap-3">
        <EnlaceBoton to="editar" state={{ lista: navegacion?.lista }} variante="secundario">
          Editar datos y roles
        </EnlaceBoton>
        {usuario.activo && !esUnoMismo && (
          <Boton
            variante="secundario"
            cargando={reenvio.isPending}
            onClick={() => {
              setAviso(undefined)
              reenvio.mutate()
            }}
          >
            Reenviar invitación
          </Boton>
        )}
        {!esUnoMismo && !confirmando && (
          <Boton
            variante={desactivar ? 'peligro' : 'primario'}
            onClick={() => {
              setAviso(undefined)
              setConfirmando(true)
            }}
          >
            {desactivar ? 'Desactivar usuario' : 'Activar usuario'}
          </Boton>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        {esUnoMismo
          ? 'Es su propio usuario: no puede desactivarse ni quitarse el rol de administrador.'
          : usuario.activo
            ? 'Reenviar la invitación sirve si todavía no la aceptó (el enlace vence).'
            : 'Un usuario inactivo no puede entrar; sus registros se conservan.'}
      </p>

      {confirmando && (
        <div className="mt-4">
          <Confirmacion
            mensaje={
              desactivar
                ? `¿Desactivar a ${nombre}? Perderá el acceso desde su siguiente acción. Sus registros se conservan y se puede volver a activar.`
                : `¿Activar a ${nombre}? Podrá volver a entrar con su contraseña.`
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
