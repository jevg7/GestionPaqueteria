import { useFormContext } from 'react-hook-form'
import { AreaDeTexto } from '../components/AreaDeTexto.tsx'
import { Campo } from '../components/Campo.tsx'
import type { DatosCliente } from './clientes.ts'

/** Datos de un cliente, iguales en el alta y en la edición; va dentro del <FormProvider>. */
export function CamposCliente() {
  const {
    register,
    formState: { errors },
  } = useFormContext<DatosCliente>()
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Campo etiqueta="Nombres" autoComplete="off" error={errors.nombres?.message} {...register('nombres')} />
      <Campo etiqueta="Apellidos" autoComplete="off" error={errors.apellidos?.message} {...register('apellidos')} />
      <Campo
        etiqueta="Teléfono"
        type="tel"
        autoComplete="off"
        ayuda="Por aquí se le avisa cuando llega su paquete."
        error={errors.telefono?.message}
        {...register('telefono')}
      />
      <Campo etiqueta="Correo (opcional)" type="email" autoComplete="off" error={errors.correo?.message} {...register('correo')} />
      <div className="sm:col-span-2">
        <AreaDeTexto
          etiqueta="Dirección (opcional)"
          ayuda="Para las entregas a domicilio."
          error={errors.direccion?.message}
          {...register('direccion')}
        />
      </div>
    </div>
  )
}
