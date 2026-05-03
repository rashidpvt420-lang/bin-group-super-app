import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@bin/shared': path.resolve(__dirname, './packages/shared/src')
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom', '@mui/material', 'firebase/app', 'firebase/firestore', 'firebase/auth'],
          ui: ['lucide-react', 'framer-motion', 'recharts']
        }
      }
    }
  }
})
