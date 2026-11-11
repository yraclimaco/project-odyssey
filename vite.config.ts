import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The bundled Natural Earth land outlines (~500 kB) keep the demo working offline.
  build: { chunkSizeWarningLimit: 1200 },
})
