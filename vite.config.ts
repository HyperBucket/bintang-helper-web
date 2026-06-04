import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/bintang-helper-web/',
  server: {
    host: true,   // expose to LAN so phone can connect
    port: 5173,
  },
})
