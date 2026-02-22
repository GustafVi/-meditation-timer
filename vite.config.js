import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',   // relative paths for GitHub Pages subdirectory
  server: {
    host: '0.0.0.0',  // bind to all interfaces, including Tailscale
  },
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,           // use existing public/manifest.json
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,ico,svg}'],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: { cacheName: 'meditation-pages', networkTimeoutSeconds: 3 }
          },
          {
            urlPattern: ({ request }) =>
              ['script', 'style'].includes(request.destination),
            handler: 'CacheFirst',
            options: {
              cacheName: 'meditation-assets',
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          }
        ]
      }
    })
  ]
})
