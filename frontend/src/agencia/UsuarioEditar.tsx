import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router'
import { useIdentidadActual } from '../auth/identidad.ts'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { EnlaceBoton } from '../components/EnlaceBoton.tsx'
import { mensajeDelEnvio } from '../lib/formularios.ts'
import { CamposUsuario } from './CamposUsuario.tsx'
import { ConUsuario } from './ConUsuario.tsx'
import {
  camposDeUsuario,
  claveUsuarios,
  datosDeUsuario,
  editarUsuario,
  esquemaEdicionUsuario,
  nombreDelUsuario,
  opcionesUsuario,
  type DatosEdicionUsuario,
  type Usuario,
} from './usuarios.ts'

export function UsuarioEditar() {
  const lista = (useLocation().state as { lista?: string } | null)?.lista
  return (
    <ConUsuario volver={`/usuarios${lista ?? ''}`}>{(usuario) => <Formulario usuario={usuario} lista={lista} />}</ConUsuario>
  )
}

function Formulario({ usuario, lista }: { usuario: Usuario; lista?: string }) {
  const esUnoMismo = usuario.id === useIdentidadActual().id
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const [errorGeneral, setErrorGeneral] = useState<string>()
  const formulario = useForm<DatosEdicionUsuario>({ resolver: zodResolver(esquemaEdicionUsuario), defaultValues: datosDeUsuario(usuario) })
  const edicion = useMutation({ mutationFn: (datos: DatosEdicionUsuario) => editarUsuario(usuario.id, datos) })
  const detalle = `/usuarios/${usuario.id}`

  const guardar = async (datos: DatosEdicionUsuario) => {
    setErrorGeneral(undefined)
    try {
      const actualizado = await edicion.mutateAsync(datos)
      queryClient.setQueryData(opcionesUsuario(usuario.id).queryKey, actualizado)
      void queryClient.invalidateQueries({ queryKey: [...claveUsuarios, 'lista'] })
      // Si cambió sus propios roles, el menú debe reflejarlos.
      if (esUnoMismo) void queryClient.invalidateQueries({ queryKey: ['identidad'] })
      navegar(detalle, { replace: true, state: { aviso: 'Cambios guardados.', lista } })
    } catch (error) {
      setErrorGeneral(mensajeDelEnvio(error, formulario.setError, camposDeUsuario))
    }
  }

  return (
    <section className="max-w-2xl">
      <Link to={detalle} state={{ lista }} className="text-sm font-medium text-blue-700 hover:underline">
        ← {nombreDelUsuario(usuario)}
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Editar usuario</h1>
      <p className="mt-1 text-sm text-slate-600">
        Correo: <strong className="break-all text-slate-900">{usuario.correo}</strong> (no se puede cambiar).
      </p>

      <FormProvider {...formulario}>
        <form onSubmit={formulario.handleSubmit(guardar)} noValidate className="mt-6 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
            <CamposUsuario rolFijo={esUnoMismo && usuario.roles.includes('ADMIN') ? 'ADMIN' : undefined} />
          </div>
          {errorGeneral && <Aviso tipo="error">{errorGeneral}</Aviso>}
          <div className="flex flex-wrap gap-3">
            <Boton type="submit" cargando={formulario.formState.isSubmitting}>
              Guardar cambios
            </Boton>
            <EnlaceBoton to={detalle} state={{ lista }} variante="secundario">
              Cancelar
            </EnlaceBoton>
          </div>
        </form>
      </FormProvider>
    </section>
  )
}
