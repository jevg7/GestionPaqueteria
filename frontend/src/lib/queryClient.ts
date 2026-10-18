import { QueryClient } from '@tanstack/react-query'

// Caché de los datos del servidor (TanStack Query), compartida por toda la aplicación.
export const queryClient = new QueryClient()
