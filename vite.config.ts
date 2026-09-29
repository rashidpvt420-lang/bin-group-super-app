import { existsSync, readFileSync } from 'node:fs'
import path from 'path'
import { defineConfig, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolvePublicAppCheckBuildEnv } from './scripts/resolve-public-appcheck-build-env.mjs'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const productionEnv = mode === 'production' && existsSync('.env.production')
    ? readFileSync('.env.production', 'utf8')
    : ''
  const resolved = resolvePublicAppCheckBuildEnv({
    env: process.env,
    mode,
    productionEnv,
  })
  if (resolved.failures.length) {
    throw new Error(`[Firebase] ${resolved.failures.join(' ')} Production build aborted.`)
  }
  if (resolved.stripDebugToken) {
    delete process.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN
    delete process.env.FIREBASE_APPCHECK_DEBUG_TOKEN
    if (resolved.siteKey) process.env.VITE_APP_CHECK_SITE_KEY = resolved.siteKey
    if (resolved.provider) process.env.VITE_APP_CHECK_PROVIDER = resolved.provider
  }

  const config: UserConfig = {
    plugins: [react()],
    envPrefix: ['VITE_', 'REACT_APP_'],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@bin/shared': path.resolve(__dirname, './src/shared-exports.ts')
      },
      dedupe: ['react', 'react-dom', '@emotion/react', '@emotion/styled', '@mui/material']
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react/jsx-runtime', '@emotion/react', '@emotion/styled', '@mui/material']
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: false,
      minify: 'esbuild',
      reportCompressedSize: false,
      chunkSizeWarningLimit: 2500
    }
  }

  if (mode === 'production' && resolved.siteKey) {
    config.define = {
      'import.meta.env.VITE_APP_CHECK_SITE_KEY': JSON.stringify(resolved.siteKey),
      'import.meta.env.VITE_APP_CHECK_PROVIDER': JSON.stringify(resolved.provider || 'enterprise'),
    }
  }

  return config
})
