import { QueryClient } from '@tanstack/react-query'
import { esErrorPasajero } from './api.ts'

// Caché de los datos del servidor (TanStack Query), compartida por toda la aplicación.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Repetir un 4xx da el mismo resultado: solo se reintenta lo pasajero, hasta dos veces.
      retry: (fallas, error) => fallas < 2 && esErrorPasajero(error),
    },
    // Las mutaciones no se reintentan (valor por defecto): repetir un pago o un alta podría duplicarlo.
  },
})
