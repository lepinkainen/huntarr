import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  root: '.',
  publicDir: 'public',
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:9705',
        changeOrigin: true
      },
      '/static': {
        target: 'http://localhost:9705',
        changeOrigin: true
      },
      // Auth form submissions - only proxy POST requests, GET handled by Vite SPA
      '/login': {
        target: 'http://localhost:9705',
        changeOrigin: true,
        bypass(req) {
          // Only proxy POST requests, let GET pass through to Vite
          if (req.method !== 'POST') {
            return req.url
          }
        }
      },
      '/logout': {
        target: 'http://localhost:9705',
        changeOrigin: true
      },
      '/setup': {
        target: 'http://localhost:9705',
        changeOrigin: true,
        bypass(req) {
          // Only proxy POST requests, let GET pass through to Vite
          if (req.method !== 'POST') {
            return req.url
          }
        }
      },
      '/auth': {
        target: 'http://localhost:9705',
        changeOrigin: true
      },
      // SSE logs endpoint - this is an API endpoint, always proxy
      '/logs': {
        target: 'http://localhost:9705',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom']
        }
      }
    }
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  }
})
