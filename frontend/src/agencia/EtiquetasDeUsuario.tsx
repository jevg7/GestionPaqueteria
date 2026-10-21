import { nombresDeRol, type RolAgencia } from '../auth/identidad.ts'
import { Etiqueta } from '../components/Etiqueta.tsx'

export function EtiquetasDeRoles({ roles }: { roles: readonly RolAgencia[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((rol) => (
        <Etiqueta key={rol} tono="azul">
          {nombresDeRol[rol]}
        </Etiqueta>
      ))}
    </div>
  )
}

export function EtiquetaActivo({ activo }: { activo: boolean }) {
  return activo ? <Etiqueta tono="verde">Activo</Etiqueta> : <Etiqueta tono="gris">Inactivo</Etiqueta>
}
