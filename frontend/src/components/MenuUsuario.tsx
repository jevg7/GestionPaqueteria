import { BotonCerrarSesion } from './BotonCerrarSesion.tsx'

/** Quién está en sesión (nombre y rol o roles) y el botón para salir, en el encabezado de los paneles. */
export function MenuUsuario({ nombre, detalle }: { nombre: string; detalle: string }) {
  return (
    <div className="ml-auto flex items-center gap-3">
      <div className="min-w-0 text-right">
        <p className="truncate text-sm font-medium">{nombre}</p>
        <p className="truncate text-xs text-slate-500">{detalle}</p>
      </div>
      <BotonCerrarSesion />
    </div>
  )
}
