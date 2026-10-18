import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Puerto fijo: el CORS de la API y la Redirect URL de Supabase Auth usan http://localhost:5173.
    port: 5173,
    strictPort: true,
  },
})
