import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'REACT_APP_'],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@bin/shared': path.resolve(__dirname, './src/shared-exports.ts')
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: 'esbuild',
    reportCompressedSize: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          // Keep React together. Splitting react/react-dom/router produced circular vendor edges.
          if (id.includes('/node_modules/react/') ||
              id.includes('/node_modules/react-dom/') ||
              id.includes('/node_modules/react-router-dom/') ||
              id.includes('/node_modules/@remix-run/router/')) {
            return 'react-core';
          }

          // Keep MUI and Emotion together to avoid MUI <-> emotion circular chunks.
          if (id.includes('/node_modules/@mui/') ||
              id.includes('/node_modules/@emotion/') ||
              id.includes('/node_modules/@popperjs/')) {
            return 'mui-core';
          }

          // Keep all Firebase packages in one async vendor target.
          if (id.includes('/node_modules/firebase/') || id.includes('/node_modules/@firebase/')) {
            return 'firebase-core';
          }

          if (id.includes('/node_modules/recharts/')) return 'charts';
          if (id.includes('/node_modules/jspdf/') || id.includes('/node_modules/jspdf-autotable/')) return 'documents';
          if (id.includes('/node_modules/lucide-react/')) return 'icons';

          return 'vendor';
        }
      }
    }
  }
})
