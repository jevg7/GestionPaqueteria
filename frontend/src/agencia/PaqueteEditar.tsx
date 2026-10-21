import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { EnlaceBoton } from '../components/EnlaceBoton.tsx'
import { mensajeDelEnvio } from '../lib/formularios.ts'
import { CamposPaquete } from './CamposPaquete.tsx'
import { ConPaquete } from './ConPaquete.tsx'
import {
  camposDePaquete,
  clavePaquetes,
  datosDePaquete,
  editarPaquete,
  esFinal,
  esquemaPaquete,
  opcionesPaquete,
  permiteCambiarClienteYMetodo,
  type DatosPaquete,
  type FormularioPaquete,
  type Paquete,
} from './paquetes.ts'

/** Edición por etapas: lo que la API permite cambiar según el estado del paquete. */
export function PaqueteEditar() {
  const lista = (useLocation().state as { lista?: string } | null)?.lista
  return (
    <ConPaquete volver={`/paquetes${lista ?? ''}`}>
      {(paquete) =>
        esFinal(paquete.estado.codigo) ? (
          <section>
            <h1 className="text-xl font-semibold">El paquete {paquete.codigoPaquete} ya no se puede modificar</h1>
            <p className="mt-2 text-sm text-slate-600">Está {paquete.estado.nombre.toLowerCase()}.</p>
            <Link
              to={`/paquetes/${paquete.id}`}
              state={{ lista }}
              className="mt-2 inline-block text-sm font-medium text-blue-700 hover:underline"
            >
              Volver al paquete
            </Link>
          </section>
        ) : (
          <Formulario paquete={paquete} lista={lista} />
        )
      }
    </ConPaquete>
  )
}

function Formulario({ paquete, lista }: { paquete: Paquete; lista?: string }) {
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const [errorGeneral, setErrorGeneral] = useState<string>()
  const formulario = useForm<FormularioPaquete, unknown, DatosPaquete>({
    resolver: zodResolver(esquemaPaquete),
    defaultValues: datosDePaquete(paquete),
  })
  const edicion = useMutation({ mutationFn: (datos: DatosPaquete) => editarPaquete(paquete.id, datos) })
  const detalle = `/paquetes/${paquete.id}`

  const guardar = async (datos: DatosPaquete) => {
    setErrorGeneral(undefined)
    try {
      const actualizado = await edicion.mutateAsync(datos)
      queryClient.setQueryData(opcionesPaquete(paquete.id).queryKey, actualizado)
      void queryClient.invalidateQueries({ queryKey: [...clavePaquetes, 'lista'] })
      navegar(detalle, { replace: true, state: { aviso: 'Cambios guardados.', lista } })
    } catch (error) {
      // 409: el paquete está en una factura, cambió de estado mientras tanto o el tracking ya lo tiene otro paquete.
      setErrorGeneral(mensajeDelEnvio(error, formulario.setError, camposDePaquete))
    }
  }

  return (
    <section className="max-w-2xl">
      <Link to={detalle} state={{ lista }} className="text-sm font-medium text-blue-700 hover:underline">
        ← {paquete.codigoPaquete}
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Editar paquete</h1>
      <p className="mt-1 text-sm text-slate-600">
        Estado: <strong className="text-slate-900">{paquete.estado.nombre}</strong>.
        {/* Solo uno ya pesado puede estar en una factura. */}
        {paquete.montoCalculado !== null && ' Si está en una factura vigente no se modifica: primero hay que anular la factura.'}
      </p>

      <FormProvider {...formulario}>
        <form onSubmit={formulario.handleSubmit(guardar)} noValidate className="mt-6 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
            <CamposPaquete paquete={paquete} clienteYMetodoFijos={!permiteCambiarClienteYMetodo(paquete.estado.codigo)} />
          </div>
          {errorGeneral && <Aviso tipo="error">{errorGeneral}</Aviso>}
          <div className="flex flex-wrap gap-3">
            <Boton type="submit" cargando={formulario.formState.isSubmitting}>
              Guardar cambios
            </Boton>
            <EnlaceBoton to={detalle} state={{ lista }} variante="secundario">
              Volver
            </EnlaceBoton>
          </div>
        </form>
      </FormProvider>
    </section>
  )
}
