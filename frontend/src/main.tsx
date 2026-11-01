import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionProvider } from './auth/SessionProvider'
import { ErrorApi } from './lib/api-error'
import App, { ErrorBoundary } from './App'
import '@fontsource-variable/nunito/wght.css'
import './styles.css'
import './theme.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: (count, error) =>
        count < 1 &&
        error instanceof ErrorApi &&
        (error.status === 0 || error.status >= 500),
    },
    mutations: { retry: false },
  },
})
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <SessionProvider>
            <App />
          </SessionProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
