import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { EnlaceBoton } from '../components/EnlaceBoton.tsx'
import { mensajeDelEnvio } from '../lib/formularios.ts'
import {
  camposDeAgencia,
  claveAgencias,
  datosDeAgencia,
  editarAgencia,
  esquemaEdicionAgencia,
  opcionesAgencia,
  type Agencia,
  type DatosAgencia,
  type DatosEdicionAgencia,
} from './agencias.ts'
import { CamposAgencia } from './CamposAgencia.tsx'
import { ConAgencia } from './ConAgencia.tsx'

export function AgenciaEditar() {
  const lista = (useLocation().state as { lista?: string } | null)?.lista
  return (
    <ConAgencia volver={`/plataforma/agencias${lista ?? ''}`}>
      {(agencia) => <Formulario agencia={agencia} lista={lista} />}
    </ConAgencia>
  )
}

function Formulario({ agencia, lista }: { agencia: Agencia; lista?: string }) {
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const [errorGeneral, setErrorGeneral] = useState<string>()
  const formulario = useForm<DatosEdicionAgencia>({
    resolver: zodResolver(esquemaEdicionAgencia),
    defaultValues: { agencia: datosDeAgencia(agencia) },
  })
  const edicion = useMutation({ mutationFn: (datos: DatosAgencia) => editarAgencia(agencia.id, datos) })
  const detalle = `/plataforma/agencias/${agencia.id}`

  const guardar = async (datos: DatosEdicionAgencia) => {
    setErrorGeneral(undefined)
    try {
      const actualizada = await edicion.mutateAsync(datos.agencia)
      queryClient.setQueryData(opcionesAgencia(agencia.id).queryKey, actualizada)
      void queryClient.invalidateQueries({ queryKey: [...claveAgencias, 'lista'] })
      navegar(detalle, { replace: true, state: { aviso: 'Cambios guardados.', lista } })
    } catch (error) {
      // La API recibe los datos en la raíz ("Nombre"); el formulario los anida en "agencia".
      setErrorGeneral(mensajeDelEnvio(error, formulario.setError, camposDeAgencia, 'agencia.'))
    }
  }

  return (
    <section className="max-w-2xl">
      <Link to={detalle} state={{ lista }} className="text-sm font-medium text-blue-700 hover:underline">
        ← {agencia.nombre}
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Editar agencia</h1>

      <FormProvider {...formulario}>
        <form onSubmit={formulario.handleSubmit(guardar)} noValidate className="mt-6 space-y-6">
          <fieldset className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
            <legend className="px-1 text-sm font-semibold">Datos de la agencia</legend>
            <CamposAgencia />
          </fieldset>
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
