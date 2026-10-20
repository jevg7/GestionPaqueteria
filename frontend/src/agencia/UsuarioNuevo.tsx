import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { Campo } from '../components/Campo.tsx'
import { EnlaceBoton } from '../components/EnlaceBoton.tsx'
import { mensajeDelEnvio } from '../lib/formularios.ts'
import { CamposUsuario } from './CamposUsuario.tsx'
import {
  camposDeNuevoUsuario,
  claveUsuarios,
  crearUsuario,
  esquemaNuevoUsuario,
  nuevoUsuarioVacio,
  opcionesUsuario,
  type DatosNuevoUsuario,
} from './usuarios.ts'

const LISTA = '/usuarios'

export function UsuarioNuevo() {
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const [errorGeneral, setErrorGeneral] = useState<string>()
  const formulario = useForm<DatosNuevoUsuario>({ resolver: zodResolver(esquemaNuevoUsuario), defaultValues: nuevoUsuarioVacio })
  const alta = useMutation({ mutationFn: crearUsuario })

  const crear = async (datos: DatosNuevoUsuario) => {
    setErrorGeneral(undefined)
    try {
      const usuario = await alta.mutateAsync(datos)
      queryClient.setQueryData(opcionesUsuario(usuario.id).queryKey, usuario)
      void queryClient.invalidateQueries({ queryKey: [...claveUsuarios, 'lista'] })
      navegar(`${LISTA}/${usuario.id}`, {
        replace: true,
        state: { aviso: `Usuario creado. Se envió la invitación a ${usuario.correo}.` },
      })
    } catch (error) {
      // Si la invitación falla, la API no deja el usuario creado.
      setErrorGeneral(mensajeDelEnvio(error, formulario.setError, camposDeNuevoUsuario))
    }
  }

  return (
    <section className="max-w-2xl">
      <Link to={LISTA} className="text-sm font-medium text-blue-700 hover:underline">
        ← Usuarios
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Nuevo usuario</h1>
      <p className="mt-1 text-sm text-slate-600">Recibirá un correo para crear su contraseña y entrar.</p>

      <FormProvider {...formulario}>
        <form onSubmit={formulario.handleSubmit(crear)} noValidate className="mt-6 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
            <CamposUsuario
              extra={
                <Campo
                  etiqueta="Correo"
                  type="email"
                  ayuda="Ahí llega la invitación; después no se puede cambiar."
                  error={formulario.formState.errors.correo?.message}
                  {...formulario.register('correo')}
                />
              }
            />
          </div>
          {errorGeneral && <Aviso tipo="error">{errorGeneral}</Aviso>}
          <div className="flex flex-wrap gap-3">
            <Boton type="submit" cargando={formulario.formState.isSubmitting}>
              Crear e invitar
            </Boton>
            <EnlaceBoton to={LISTA} variante="secundario">
              Cancelar
            </EnlaceBoton>
          </div>
        </form>
      </FormProvider>
    </section>
  )
}
