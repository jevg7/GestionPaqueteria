import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { EnlaceBoton } from '../components/EnlaceBoton.tsx'
import { mensajeDelEnvio } from '../lib/formularios.ts'
import { nombreDelCliente, opcionesCliente, referenciaDe, type ReferenciaCliente } from './clientes.ts'
import { CamposPaquete } from './CamposPaquete.tsx'
import {
  camposDePaquete,
  clavePaquetes,
  esquemaPaquete,
  opcionesPaquete,
  paqueteVacio,
  registrarPaquete,
  type DatosPaquete,
  type FormularioPaquete,
} from './paquetes.ts'

const LISTA = '/paquetes'

/** Registro de un paquete. Con ?cliente=<id> (desde la ficha del cliente) llega con el cliente elegido. */
export function PaqueteNuevo() {
  const [parametros] = useSearchParams()
  const idCliente = Number(parametros.get('cliente'))
  const conCliente = Number.isSafeInteger(idCliente) && idCliente > 0
  const cliente = useQuery({ ...opcionesCliente(conCliente ? idCliente : 0), enabled: conCliente })

  if (conCliente && cliente.isPending) return <p className="text-sm text-slate-500">Cargando…</p>
  // Si el cliente no existe o no se pudo leer, el formulario empieza sin cliente.
  const elegido = conCliente && cliente.data?.activo ? referenciaDe(cliente.data) : null
  const inactivo = conCliente && cliente.data && !cliente.data.activo ? nombreDelCliente(cliente.data) : undefined
  return <Formulario clienteInicial={elegido} clienteInactivo={inactivo} />
}

function Formulario({ clienteInicial, clienteInactivo }: { clienteInicial: ReferenciaCliente | null; clienteInactivo?: string }) {
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const [errorGeneral, setErrorGeneral] = useState<string>()
  const formulario = useForm<FormularioPaquete, unknown, DatosPaquete>({
    resolver: zodResolver(esquemaPaquete),
    defaultValues: paqueteVacio(clienteInicial),
  })
  const alta = useMutation({ mutationFn: registrarPaquete })

  const registrar = async (datos: DatosPaquete) => {
    setErrorGeneral(undefined)
    try {
      const paquete = await alta.mutateAsync(datos)
      queryClient.setQueryData(opcionesPaquete(paquete.id).queryKey, paquete)
      void queryClient.invalidateQueries({ queryKey: [...clavePaquetes, 'lista'] })
      navegar(`${LISTA}/${paquete.id}`, {
        replace: true,
        state: { aviso: `Paquete ${paquete.codigoPaquete} registrado para ${nombreDelCliente(paquete.cliente)}.`, registrado: true },
      })
    } catch (error) {
      // 409: cliente o método desactivados, o tracking ya registrado en otro paquete (la API dice cuál).
      setErrorGeneral(mensajeDelEnvio(error, formulario.setError, camposDePaquete))
    }
  }

  return (
    <section className="max-w-2xl">
      <Link to={LISTA} className="text-sm font-medium text-blue-700 hover:underline">
        ← Paquetes
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Registrar paquete</h1>
      <p className="mt-1 text-sm text-slate-600">
        El paquete que avisó el cliente. Queda Registrado hasta que llegue a la bodega de Miami; el código (PKG-…) lo
        asigna el sistema.
      </p>
      {clienteInactivo && (
        <div className="mt-4">
          <Aviso tipo="advertencia">
            {clienteInactivo} está desactivado: no se le pueden registrar paquetes. Actívelo en su ficha o elija otro
            cliente.
          </Aviso>
        </div>
      )}

      <FormProvider {...formulario}>
        <form onSubmit={formulario.handleSubmit(registrar)} noValidate className="mt-6 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
            <CamposPaquete />
          </div>
          {errorGeneral && <Aviso tipo="error">{errorGeneral}</Aviso>}
          <div className="flex flex-wrap gap-3">
            <Boton type="submit" cargando={formulario.formState.isSubmitting}>
              Registrar paquete
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
