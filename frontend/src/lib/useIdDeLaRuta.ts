import { useParams } from 'react-router'

/** El :id de la ruta como número; null si no es un id válido (la página muestra "no existe"). */
export function useIdDeLaRuta(): number | null {
  const id = Number(useParams().id)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}
