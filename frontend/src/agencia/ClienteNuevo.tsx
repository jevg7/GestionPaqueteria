import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { EnlaceBoton } from '../components/EnlaceBoton.tsx'
import { mensajeDelEnvio } from '../lib/formularios.ts'
import { CamposCliente } from './CamposCliente.tsx'
import {
  camposDeCliente,
  claveClientes,
  clienteVacio,
  crearCliente,
  esquemaCliente,
  opcionesCliente,
  type DatosCliente,
} from './clientes.ts'

const LISTA = '/clientes'

export function ClienteNuevo() {
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const [errorGeneral, setErrorGeneral] = useState<string>()
  const formulario = useForm<DatosCliente>({ resolver: zodResolver(esquemaCliente), defaultValues: clienteVacio })
  const alta = useMutation({ mutationFn: crearCliente })

  const registrar = async (datos: DatosCliente) => {
    setErrorGeneral(undefined)
    try {
      const cliente = await alta.mutateAsync(datos)
      queryClient.setQueryData(opcionesCliente(cliente.id).queryKey, cliente)
      void queryClient.invalidateQueries({ queryKey: [...claveClientes, 'lista'] })
      navegar(`${LISTA}/${cliente.id}`, {
        replace: true,
        state: { aviso: `Cliente registrado con el código ${cliente.codigoCliente}.` },
      })
    } catch (error) {
      setErrorGeneral(mensajeDelEnvio(error, formulario.setError, camposDeCliente))
    }
  }

  return (
    <section className="max-w-2xl">
      <Link to={LISTA} className="text-sm font-medium text-blue-700 hover:underline">
        ← Clientes
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Nuevo cliente</h1>
      <p className="mt-1 text-sm text-slate-600">El código del cliente (CLI-…) lo asigna el sistema al registrarlo.</p>

      <FormProvider {...formulario}>
        <form onSubmit={formulario.handleSubmit(registrar)} noValidate className="mt-6 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
            <CamposCliente />
          </div>
          {errorGeneral && <Aviso tipo="error">{errorGeneral}</Aviso>}
          <div className="flex flex-wrap gap-3">
            <Boton type="submit" cargando={formulario.formState.isSubmitting}>
              Registrar cliente
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
