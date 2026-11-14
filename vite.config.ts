import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'GradPath | MSc IT for Business',
        short_name: 'GradPath',
        description:
          'Learn with purpose. Master every course. Graduate with excellence. A supplementary study platform for MSc IT for Business students.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0b1120',
        theme_color: '#0f1a33',
        categories: ['education', 'productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell and static assets only. Authenticated API responses are never cached by the
        // service worker; private data is stored per-user in IndexedDB and cleared on sign-out.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        // Keep the install light on mobile data: Mermaid's diagram renderers (and the font subsets for
        // non-Latin scripts) are not precached. They are cached at runtime the first time a lesson uses them.
        globIgnores: [
          '**/assets/*-[A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9]-*.js',
          '**/assets/mermaid.core-*.js',
          '**/assets/cytoscape*.js',
          '**/assets/katex-*.js',
          '**/assets/*cyrillic*.woff2',
          '**/assets/*greek*.woff2',
          '**/assets/*vietnamese*.woff2',
        ],
        runtimeCaching: [
          {
            // Build assets have content-hashed names, so a cached copy never goes stale.
            urlPattern: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith('/assets/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'gradpath-lazy-assets',
              expiration: { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
        // Shows Web Push notifications (streak reminders) and opens the app when one is tapped.
        importScripts: ['/push-handler.js'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router'],
          data: ['@supabase/supabase-js', '@tanstack/react-query'],
          charts: ['recharts'],
        },
      },
    },
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
})
