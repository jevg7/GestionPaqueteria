import type { ReactNode } from 'react'
import { useIdentidadActual, type Rol } from './identidad.ts'
import { tieneAlgunRol } from './secciones.ts'

/** Muestra el contenido solo a quien tenga alguno de los roles; la API lo vuelve a comprobar. */
export function RequiereRoles({ roles, children }: { roles: readonly Rol[]; children: ReactNode }) {
  const identidad = useIdentidadActual()
  if (tieneAlgunRol(identidad.roles, roles)) return children
  return (
    <section>
      <h1 className="text-xl font-semibold">Sin acceso</h1>
      <p className="mt-2 text-sm text-slate-600">Sus roles no permiten usar esta sección.</p>
    </section>
  )
}
