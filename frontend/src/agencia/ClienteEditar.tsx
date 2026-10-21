import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { EnlaceBoton } from '../components/EnlaceBoton.tsx'
import { mensajeDelEnvio } from '../lib/formularios.ts'
import { CamposCliente } from './CamposCliente.tsx'
import {
  camposDeCliente,
  claveClientes,
  datosDeCliente,
  editarCliente,
  esquemaCliente,
  nombreDelCliente,
  opcionesCliente,
  type Cliente,
  type DatosCliente,
} from './clientes.ts'
import { ConCliente } from './ConCliente.tsx'

export function ClienteEditar() {
  const lista = (useLocation().state as { lista?: string } | null)?.lista
  return (
    <ConCliente volver={`/clientes${lista ?? ''}`}>{(cliente) => <Formulario cliente={cliente} lista={lista} />}</ConCliente>
  )
}

function Formulario({ cliente, lista }: { cliente: Cliente; lista?: string }) {
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const [errorGeneral, setErrorGeneral] = useState<string>()
  const formulario = useForm<DatosCliente>({ resolver: zodResolver(esquemaCliente), defaultValues: datosDeCliente(cliente) })
  const edicion = useMutation({ mutationFn: (datos: DatosCliente) => editarCliente(cliente.id, datos) })
  const detalle = `/clientes/${cliente.id}`

  const guardar = async (datos: DatosCliente) => {
    setErrorGeneral(undefined)
    try {
      const actualizado = await edicion.mutateAsync(datos)
      queryClient.setQueryData(opcionesCliente(cliente.id).queryKey, actualizado)
      void queryClient.invalidateQueries({ queryKey: [...claveClientes, 'lista'] })
      navegar(detalle, { replace: true, state: { aviso: 'Cambios guardados.', lista } })
    } catch (error) {
      setErrorGeneral(mensajeDelEnvio(error, formulario.setError, camposDeCliente))
    }
  }

  return (
    <section className="max-w-2xl">
      <Link to={detalle} state={{ lista }} className="text-sm font-medium text-blue-700 hover:underline">
        ← {nombreDelCliente(cliente)}
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Editar cliente</h1>
      <p className="mt-1 text-sm text-slate-600">
        Código: <strong className="text-slate-900">{cliente.codigoCliente}</strong> (no cambia).
      </p>

      <FormProvider {...formulario}>
        <form onSubmit={formulario.handleSubmit(guardar)} noValidate className="mt-6 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
            <CamposCliente />
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
