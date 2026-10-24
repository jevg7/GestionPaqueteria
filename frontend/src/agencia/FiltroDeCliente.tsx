import { useQuery } from '@tanstack/react-query'
import { nombreDelCliente, opcionesCliente } from './clientes.ts'

/** "Paquetes de: María José Pérez (CLI-000001)", con el botón para quitar el filtro de la lista. */
export function FiltroDeCliente({ etiqueta, id, alQuitar }: { etiqueta: string; id: number; alQuitar: () => void }) {
  const cliente = useQuery(opcionesCliente(id))
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-slate-600">{etiqueta}</span>
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 py-1 pr-1 pl-3 font-medium text-blue-800">
        {cliente.data ? `${nombreDelCliente(cliente.data)} (${cliente.data.codigoCliente})` : `cliente ${id}`}
        <button
          type="button"
          onClick={alQuitar}
          aria-label="Quitar el filtro por cliente"
          className="grid size-6 place-items-center rounded-full hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-blue-700"
        >
          ×
        </button>
      </span>
    </div>
  )
}
