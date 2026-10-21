import { useEffect, useState } from 'react'

/** El valor, pero solo después de que deja de cambiar por un momento (p. ej. para buscar al dejar de escribir). */
export function useDiferido<T>(valor: T, espera = 300): T {
  const [diferido, setDiferido] = useState(valor)
  useEffect(() => {
    const temporizador = setTimeout(() => setDiferido(valor), espera)
    return () => clearTimeout(temporizador)
  }, [valor, espera])
  return diferido
}
