import { useQuery } from '@tanstack/react-query'
import { useController, useFormContext } from 'react-hook-form'
import { AreaDeTexto } from '../components/AreaDeTexto.tsx'
import { Aviso } from '../components/Aviso.tsx'
import { Campo } from '../components/Campo.tsx'
import { Dato } from '../components/Dato.tsx'
import { Seleccion } from '../components/Seleccion.tsx'
import { mensajeDeError } from '../lib/errores.ts'
import { opcionesCatalogos } from './catalogos.ts'
import { nombreDelCliente } from './clientes.ts'
import type { FormularioPaquete, Paquete } from './paquetes.ts'
import { SelectorDeCliente } from './SelectorDeCliente.tsx'

type Props = {
  /**
   * El paquete que se edita. Si ya pasó de RECIBIDO_EN_MIAMI, cliente y método se muestran sin poder cambiarlos:
   * el formulario los envía tal como estaban.
   */
  paquete?: Paquete
  clienteYMetodoFijos?: boolean
}

/** Datos de un paquete, iguales en el registro y en la edición; va dentro del <FormProvider>. */
export function CamposPaquete({ paquete, clienteYMetodoFijos = false }: Props) {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<FormularioPaquete>()
  const { field } = useController({ name: 'cliente', control })
  const catalogos = useQuery(opcionesCatalogos)
  const metodos = catalogos.data?.metodosEnvio ?? []
  // Un método desactivado no está en el catálogo, pero el paquete que lo usa lo conserva al editarse.
  const metodoActual = paquete?.metodoEnvio
  const opciones = metodoActual && !metodos.some((m) => m.codigo === metodoActual.codigo) ? [...metodos, metodoActual] : metodos

  return (
    <div className="space-y-4">
      {paquete && clienteYMetodoFijos ? (
        <div>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Dato nombre="Cliente" valor={`${nombreDelCliente(paquete.cliente)} (${paquete.cliente.codigoCliente})`} />
            <Dato nombre="Método de envío" valor={paquete.metodoEnvio.nombre} />
          </dl>
          <p className="mt-2 text-xs text-slate-500">
            El cliente y el método de envío solo se cambian antes de asignar el paquete a un embarque.
          </p>
        </div>
      ) : (
        <>
          <SelectorDeCliente valor={field.value} alCambiar={field.onChange} error={errors.cliente?.message} />
          {catalogos.isError && <Aviso tipo="error">{mensajeDeError(catalogos.error)}</Aviso>}
          <Seleccion etiqueta="Método de envío" error={errors.metodoEnvio?.message} {...register('metodoEnvio')}>
            <option value="">Elija un método…</option>
            {opciones.map((metodo) => (
              <option key={metodo.codigo} value={metodo.codigo}>
                {metodo.nombre}
              </option>
            ))}
          </Seleccion>
        </>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          etiqueta="Tracking (opcional)"
          autoComplete="off"
          ayuda="El número con que llega a la bodega de Miami: sirve para reconocerlo."
          error={errors.trackingExterno?.message}
          {...register('trackingExterno')}
        />
        <Campo
          etiqueta="Tienda (opcional)"
          autoComplete="off"
          placeholder="Amazon, Shein…"
          error={errors.tienda?.message}
          {...register('tienda')}
        />
      </div>
      <AreaDeTexto
        etiqueta="Descripción"
        ayuda="Qué contiene, como lo describió el cliente."
        error={errors.descripcion?.message}
        {...register('descripcion')}
      />
    </div>
  )
}
