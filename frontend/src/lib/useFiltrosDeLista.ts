import { useSearchParams } from 'react-router'

/**
 * Filtros y página de una lista guardados en la dirección: sobreviven a una recarga y a volver desde el
 * detalle. Cambiar un filtro vuelve a la primera página (la lista es otra).
 */
export function useFiltrosDeLista() {
  const [parametros, setParametros] = useSearchParams()
  const pagina = Math.max(1, Number.parseInt(parametros.get('pagina') ?? '', 10) || 1)

  const cambiar = (nombre: string, valor: string) =>
    setParametros(
      (actuales) => {
        const nuevos = new URLSearchParams(actuales)
        if (valor) nuevos.set(nombre, valor)
        else nuevos.delete(nombre)
        if (nombre !== 'pagina') nuevos.delete('pagina')
        return nuevos
      },
      // flushSync: los campos de búsqueda y las casillas toman su valor de la dirección; si la actualización
      // fuera una transición (lo normal en React Router), mostrarían el valor viejo y al escribir rápido se
      // perderían letras.
      { replace: true, flushSync: true },
    )

  return {
    leer: (nombre: string) => parametros.get(nombre) ?? '',
    pagina,
    cambiar,
    cambiarPagina: (nueva: number) => cambiar('pagina', nueva === 1 ? '' : String(nueva)),
  }
}
