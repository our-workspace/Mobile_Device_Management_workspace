import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // توجيه API calls للـ Backend
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      // لا نوجّه الـ WebSocket هنا لأن الـ Dashboard يتصل مباشرة
    },
  },
})
