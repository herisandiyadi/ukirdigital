import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':   ['react', 'react-dom', 'react-router-dom'],
          'vendor-query':   ['@tanstack/react-query'],
          'vendor-charts':  ['recharts'],
          'vendor-forms':   ['react-hook-form', 'react-dropzone'],
          'vendor-ui':      ['lucide-react', '@heroicons/react', 'clsx', 'react-hot-toast'],
          'vendor-zustand': ['zustand'],
          'vendor-axios':   ['axios'],
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5173,
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      'defile-demanding-concert.ngrok-free.dev',
    ],
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
      '/ws':  { target: 'ws://localhost:8000',  ws: true },
    },
  },
})
