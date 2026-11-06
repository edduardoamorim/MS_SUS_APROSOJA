import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, path.resolve(__dirname, '..'), ['VITE_', 'CARTO_']);
  const localEnv = loadEnv(mode, __dirname, ['VITE_', 'CARTO_']);
  const cartoKey = rootEnv.CARTO_BASEMAPS_KEY || localEnv.CARTO_BASEMAPS_KEY || rootEnv.VITE_CARTO_BASEMAPS_KEY || localEnv.VITE_CARTO_BASEMAPS_KEY || process.env.CARTO_BASEMAPS_KEY || process.env.VITE_CARTO_BASEMAPS_KEY || '';

  return {
    base: process.env.VITE_BASE_URL || '/',
    envPrefix: ['VITE_', 'CARTO_'],
    define: {
      'import.meta.env.CARTO_BASEMAPS_KEY': JSON.stringify(cartoKey),
      'import.meta.env.VITE_CARTO_BASEMAPS_KEY': JSON.stringify(cartoKey),
    },
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      devOptions: {
        enabled: true,
        type: 'module',
        navigateFallback: '/index.html',
      },
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'icons.svg', 'logo_ms_sus.png', 'logo_ms_sus.jpeg', 'logo_emblem.png'],
      manifest: {
        name: 'MS Sustentável - Plataforma de Certificação RTRS',
        short_name: 'MS Sustentável',
        description: 'Plataforma de gestão socioambiental e certificação RTRS para produtores e técnicos de MS',
        theme_color: '#059669',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/logo_ms_sus.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/logo_ms_sus.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any'
          }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpeg,jpg,json,woff,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [
          new RegExp('^/(rest|auth|storage|realtime)/')
        ],
        runtimeCaching: [
          {
            urlPattern: new RegExp('^https://fonts\\.googleapis\\.com/.*'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: new RegExp('^https://fonts\\.gstatic\\.com/.*'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: new RegExp('^https://[a-d]\\.basemaps\\.cartocdn\\.com/rastertiles/voyager/.*'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'carto-tiles-cache',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 14
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            // Apenas o catálogo estático de perguntas RTRS é armazenado em cache pelo Service Worker.
            // Tabelas operacionais dinâmicas (propriedades, auditorias, respostas) são controladas via Dexie/IndexedDB sem risco de dados obsoletos.
            urlPattern: new RegExp('.*\\.supabase\\.co/rest/v1/(perguntas_rtrs).*'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-static-catalog-cache',
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 7
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    cors: true,
    allowedHosts: true,
    proxy: {
      '/auth': {
        target: 'http://127.0.0.1:54321',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['access-control-allow-origin'] = '*';
            proxyRes.headers['access-control-allow-headers'] = '*';
            proxyRes.headers['access-control-allow-methods'] = '*';
          });
        }
      },
      '/rest': {
        target: 'http://127.0.0.1:54321',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['access-control-allow-origin'] = '*';
            proxyRes.headers['access-control-allow-headers'] = '*';
            proxyRes.headers['access-control-allow-methods'] = '*';
          });
        }
      },
      '/storage': {
        target: 'http://127.0.0.1:54321',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['access-control-allow-origin'] = '*';
            proxyRes.headers['access-control-allow-headers'] = '*';
            proxyRes.headers['access-control-allow-methods'] = '*';
          });
        }
      },
      '/realtime': {
        target: 'http://127.0.0.1:54321',
        changeOrigin: true,
        secure: false,
        ws: true,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['access-control-allow-origin'] = '*';
            proxyRes.headers['access-control-allow-headers'] = '*';
            proxyRes.headers['access-control-allow-methods'] = '*';
          });
        }
      }
    }
  }
  };
})
