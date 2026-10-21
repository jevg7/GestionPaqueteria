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
  build: {
    rolldownOptions: {
      output: {
        // Las librerías van en archivos propios: cambian poco y el navegador las conserva en caché entre
        // despliegues, que así solo descargan de nuevo el código de la aplicación.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/ },
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
            { name: 'vendor', test: /node_modules[\\/]/ },
          ],
        },
      },
    },
  },
})
