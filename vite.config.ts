import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          workbox: {
            globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
            runtimeCaching: [
              {
                urlPattern: /^https:\/\/api\.lexoffice\.io\/.*/i,
                handler: 'NetworkFirst',
                options: {
                  cacheName: 'lexoffice-api-cache',
                  expiration: {
                    maxEntries: 50,
                    maxAgeSeconds: 60 * 60 * 24, // 24 hours
                  },
                },
              },
              {
                urlPattern: /^https:\/\/generativelanguage\.googleapis\.com\/.*/i,
                handler: 'NetworkOnly', // Don't cache AI responses
              },
            ],
          },
          includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
          manifest: {
            name: 'Steuer-KI-Agent Software',
            short_name: 'Steuer-KI',
            description: 'Umfassende Buchhaltungs- und Steuersoftware mit KI-gestützter Belegerfassung',
            theme_color: '#3b82f6',
            background_color: '#f8fafc',
            display: 'standalone',
            icons: [
              {
                src: 'pwa-192x192.png',
                sizes: '192x192',
                type: 'image/png',
              },
              {
                src: 'pwa-512x512.png',
                sizes: '512x512',
                type: 'image/png',
              },
            ],
          },
        }),
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      server: {
        host: '0.0.0.0',
        port: Number(env.VITE_DEV_PORT ?? 5173),
        strictPort: true,
        proxy: {
          '/api': {
            target: `http://localhost:${env.VITE_LEXOFFICE_PROXY_PORT || 5174}`,
            changeOrigin: true,
            secure: false,
            configure: (proxy) => {
              proxy.on('error', (err) => {
                console.error('[Vite Proxy] API Proxy Fehler:', err.message);
              });
            },
          },
          '/api/lexoffice': {
            target: `http://localhost:${env.VITE_LEXOFFICE_PROXY_PORT || 5174}`,
            changeOrigin: true,
            secure: false,
            // Nur weiterleiten, wenn kein anderer Origin gesetzt ist
            configure: (proxy) => {
              proxy.on('error', (err) => {
                console.error('[Vite Proxy] Lexoffice Proxy Fehler:', err.message);
              });
            },
          },
        },
      },
      preview: {
        host: '0.0.0.0',
        port: Number(env.VITE_PREVIEW_PORT ?? 4173),
        strictPort: true,
      },
      build: {
        modulePreload: {
          polyfill: false,
        },
        rollupOptions: {
          output: {
            manualChunks: (id) => {
              // React in separaten Chunk
              if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
                return 'react-vendor';
              }
              // Google AI SDK in separaten Chunk
              if (id.includes('@google/genai') || id.includes('google')) {
                return 'ai-vendor';
              }
              // Node.js built-ins und utilities
              if (id.includes('node_modules') && (
                id.includes('crypto') ||
                id.includes('util') ||
                id.includes('buffer') ||
                id.includes('events')
              )) {
                return 'node-vendor';
              }
              // Alle anderen node_modules in vendor chunk
              if (id.includes('node_modules')) {
                return 'vendor';
              }
              // Große lokale Dateien in separate Chunks
              if (id.includes('services/') && id.includes('geminiService')) {
                return 'ai-service';
              }
              if (id.includes('services/') && id.includes('lexofficeService')) {
                return 'lexoffice-service';
              }
              if (id.includes('components/') && id.includes('DocumentsView')) {
                return 'documents-view';
              }
              if (id.includes('components/') && id.includes('AccountingView')) {
                return 'accounting-view';
              }
            },
          },
        },
        // Weitere Optimierungen
        chunkSizeWarningLimit: 600, // Erhöhe das Limit leicht
        minify: 'terser',
        terserOptions: {
          compress: {
            drop_console: mode === 'production', // Entferne console.logs im Production
            drop_debugger: mode === 'production',
            pure_funcs: mode === 'production' ? ['console.log', 'console.info', 'console.debug'] : [],
          },
          mangle: {
            safari10: true,
          },
        },
        // CSS Code Splitting
        cssCodeSplit: true,
        // Source Maps nur im Development
        sourcemap: mode === 'development',
        // Compression
        reportCompressedSize: false, // Schnellerer Build
      },
    };
});



