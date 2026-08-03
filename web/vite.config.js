import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://127.0.0.1:4500',
      '/messages': 'http://127.0.0.1:4500',
      '/health': 'http://127.0.0.1:4500',
      '/qr': 'http://127.0.0.1:4500',
      '/test': 'http://127.0.0.1:4500',
      '/socket.io': {
        target: 'http://127.0.0.1:4500',
        ws: true,
      },
    },
  },
})
