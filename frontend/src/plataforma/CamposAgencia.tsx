import { useFormContext } from 'react-hook-form'
import { Campo } from '../components/Campo.tsx'
import type { DatosEdicionAgencia } from './agencias.ts'

/** Datos de la agencia, iguales en el alta y en la edición; va dentro del <FormProvider> del formulario. */
export function CamposAgencia() {
  const {
    register,
    formState: { errors },
  } = useFormContext<DatosEdicionAgencia>()
  const error = errors.agencia
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Campo etiqueta="Nombre" error={error?.nombre?.message} {...register('agencia.nombre')} />
      </div>
      <Campo etiqueta="RUC (opcional)" error={error?.ruc?.message} {...register('agencia.ruc')} />
      <Campo etiqueta="Teléfono (opcional)" type="tel" error={error?.telefono?.message} {...register('agencia.telefono')} />
      <div className="sm:col-span-2">
        <Campo
          etiqueta="Correo de contacto (opcional)"
          type="email"
          error={error?.correoContacto?.message}
          {...register('agencia.correoContacto')}
        />
      </div>
    </div>
  )
}
