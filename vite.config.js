import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev only: CREATIVE_API_PROXY=http://127.0.0.1:3901 (+ VITE_CREATIVE_LIVE=1) points Creative Weekly
// at a locally running backend instead of the offline fixture. Inert unless the env var is set.
const creativeProxy = process.env.CREATIVE_API_PROXY
  ? { '/api/creative-reports': { target: process.env.CREATIVE_API_PROXY, changeOrigin: true } }
  : undefined

// Dev only: CP_API_PROXY=http://127.0.0.1:3902 makes `vite preview` (the production build) talk to a local backend —
// the whole app runs live against a test database. Inert unless the env var is set.
const apiProxy = process.env.CP_API_PROXY
  ? { '/api': { target: process.env.CP_API_PROXY, changeOrigin: true } }
  : undefined

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: creativeProxy ? { proxy: creativeProxy } : undefined,
  preview: apiProxy ? { proxy: apiProxy } : undefined,
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          ui: ['@headlessui/react', 'lucide-react'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
})
