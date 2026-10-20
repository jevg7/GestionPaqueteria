import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { cerrarSesionRechazada } from '../auth/salida.ts'
import { ApiError, esErrorPasajero } from './api.ts'

// Un 401 de la API significa que la sesión ya no sirve (expiró o la revocaron): se cierra y el usuario
// vuelve a la pantalla de inicio de sesión, que explica por qué.
function alFallar(error: Error) {
  if (error instanceof ApiError && error.status === 401) cerrarSesionRechazada(error.message)
}

// Caché de los datos del servidor (TanStack Query), compartida por toda la aplicación.
export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: alFallar }),
  mutationCache: new MutationCache({ onError: alFallar }),
  defaultOptions: {
    queries: {
      // Repetir un 4xx da el mismo resultado: solo se reintenta lo pasajero, hasta dos veces.
      retry: (fallas, error) => fallas < 2 && esErrorPasajero(error),
    },
    // Las mutaciones no se reintentan (valor por defecto): repetir un pago o un alta podría duplicarlo.
  },
})
