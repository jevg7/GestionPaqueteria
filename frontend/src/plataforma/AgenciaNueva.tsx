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
import {
  camposDeNuevaAgencia,
  claveAgencias,
  crearAgencia,
  esquemaNuevaAgencia,
  nuevaAgenciaVacia,
  opcionesAgencia,
  type DatosNuevaAgencia,
} from './agencias.ts'
import { CamposAgencia } from './CamposAgencia.tsx'

const LISTA = '/plataforma/agencias'

export function AgenciaNueva() {
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const [errorGeneral, setErrorGeneral] = useState<string>()
  const formulario = useForm<DatosNuevaAgencia>({ resolver: zodResolver(esquemaNuevaAgencia), defaultValues: nuevaAgenciaVacia })
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = formulario
  const alta = useMutation({ mutationFn: crearAgencia })

  const crear = async (datos: DatosNuevaAgencia) => {
    setErrorGeneral(undefined)
    try {
      const agencia = await alta.mutateAsync(datos)
      queryClient.setQueryData(opcionesAgencia(agencia.id).queryKey, agencia)
      void queryClient.invalidateQueries({ queryKey: [...claveAgencias, 'lista'] })
      navegar(`${LISTA}/${agencia.id}`, {
        replace: true,
        state: { aviso: `Agencia creada. Se envió la invitación a ${datos.admin.correo}.` },
      })
    } catch (error) {
      // Todo o nada: si algo falla (incluida la invitación), la API no deja nada creado.
      setErrorGeneral(mensajeDelEnvio(error, setError, camposDeNuevaAgencia))
    }
  }

  return (
    <section className="max-w-2xl">
      <Link to={LISTA} className="text-sm font-medium text-blue-700 hover:underline">
        ← Agencias
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Nueva agencia</h1>
      <p className="mt-1 text-sm text-slate-600">
        Nace con las ubicaciones Bodega Miami (MIA) y Agencia Managua (MGA) y la ruta Miami → Managua. Las tarifas
        las define su administrador.
      </p>

      <FormProvider {...formulario}>
        <form onSubmit={handleSubmit(crear)} noValidate className="mt-6 space-y-6">
          <fieldset className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
            <legend className="px-1 text-sm font-semibold">Datos de la agencia</legend>
            <CamposAgencia />
          </fieldset>

          <fieldset className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
            <legend className="px-1 text-sm font-semibold">Primer administrador</legend>
            <p className="mb-4 text-sm text-slate-600">
              Recibirá un correo para crear su contraseña y administrar la agencia.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Nombres" error={errors.admin?.nombres?.message} {...register('admin.nombres')} />
              <Campo etiqueta="Apellidos" error={errors.admin?.apellidos?.message} {...register('admin.apellidos')} />
              <Campo
                etiqueta="Correo"
                type="email"
                ayuda="Ahí llega la invitación."
                error={errors.admin?.correo?.message}
                {...register('admin.correo')}
              />
              <Campo etiqueta="Teléfono (opcional)" type="tel" error={errors.admin?.telefono?.message} {...register('admin.telefono')} />
            </div>
          </fieldset>

          {errorGeneral && <Aviso tipo="error">{errorGeneral}</Aviso>}
          <div className="flex flex-wrap gap-3">
            <Boton type="submit" cargando={isSubmitting}>
              Crear agencia e invitar
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
