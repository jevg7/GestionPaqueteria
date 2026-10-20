import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useController, useFormContext } from 'react-hook-form'
import type { RolAgencia } from '../auth/identidad.ts'
import { Aviso } from '../components/Aviso.tsx'
import { Campo } from '../components/Campo.tsx'
import { Casilla } from '../components/Casilla.tsx'
import { mensajeDeError } from '../lib/errores.ts'
import { opcionesRolesAsignables, type DatosEdicionUsuario } from './usuarios.ts'

type Props = {
  /** Campo extra junto a los datos personales (el correo, solo en el alta). */
  extra?: ReactNode
  /** Rol que no se puede quitar (el ADMIN de quien se edita a sí mismo): su casilla queda marcada y bloqueada. */
  rolFijo?: RolAgencia
}

/** Datos y roles de un empleado, iguales en el alta y en la edición; va dentro del <FormProvider>. */
export function CamposUsuario({ extra, rolFijo }: Props) {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<DatosEdicionUsuario>()
  // Los roles se manejan como lista (no como casillas sueltas) para que una casilla bloqueada siga contando.
  const { field } = useController({ name: 'roles', control })
  const roles = useQuery(opcionesRolesAsignables)

  const alternar = (codigo: RolAgencia, marcado: boolean) =>
    field.onChange(marcado ? [...field.value, codigo] : field.value.filter((rol) => rol !== codigo))

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Nombres" error={errors.nombres?.message} {...register('nombres')} />
        <Campo etiqueta="Apellidos" error={errors.apellidos?.message} {...register('apellidos')} />
        {extra}
        <Campo etiqueta="Teléfono (opcional)" type="tel" error={errors.telefono?.message} {...register('telefono')} />
      </div>
      <fieldset>
        <legend className="text-sm font-medium text-slate-700">Roles</legend>
        <p className="text-xs text-slate-500">Definen qué secciones ve y qué puede hacer.</p>
        {roles.isPending ? (
          <p className="mt-2 text-sm text-slate-500">Cargando roles…</p>
        ) : roles.isError ? (
          <div className="mt-2">
            <Aviso tipo="error">{mensajeDeError(roles.error)}</Aviso>
          </div>
        ) : (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {roles.data.map((rol) => (
              <Casilla
                key={rol.codigo}
                etiqueta={rol.nombre}
                descripcion={rol.codigo === rolFijo ? 'No puede quitarse su propio rol de administrador.' : rol.descripcion}
                checked={field.value.includes(rol.codigo)}
                disabled={rol.codigo === rolFijo}
                onChange={(evento) => alternar(rol.codigo, evento.target.checked)}
              />
            ))}
          </div>
        )}
        {errors.roles?.message && <p className="mt-1 text-sm text-red-700">{errors.roles.message}</p>}
      </fieldset>
    </div>
  )
}
