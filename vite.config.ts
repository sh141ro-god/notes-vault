import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

import { cloudflare } from "@cloudflare/vite-plugin";

// GitHub Pages: приложение раздаётся из подпапки репозитория.
// Переопределяется переменной окружения BASE_PATH при деплое.
const base = process.env.BASE_PATH ?? '/'

/**
 * Строгий Content-Security-Policy для прод-сборки.
 *
 * - `script-src 'wasm-unsafe-eval'` обязателен: ядро libsodium компилирует WASM,
 *   а Chromium без этого источника блокирует `WebAssembly.instantiate`.
 * - `style-src 'self'` без `'unsafe-inline'`: стили вынесены в CSS-файлы.
 * - `frame-ancestors` в `<meta>` браузеры игнорируют (дублируется JS-защитой в
 *   main.tsx), но оставлен на случай доставки этого же CSP заголовком.
 */
const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ')

/** Инжектит CSP-мету только в прод-сборку (в dev строгий CSP ломает HMR/eval). */
function prodCspPlugin(): Plugin {
  return {
    name: 'inject-prod-csp',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: PROD_CSP,
          },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

export default defineConfig({
  base,
  resolve: {
    alias: {
      // ESM-сборка libsodium-wrappers-sumo@0.7.x сломана (импортирует
      // отсутствующий sibling ./libsodium-sumo.mjs). Используем рабочую
      // CJS-сборку обёртки — она тянет ядро из пакета libsodium-sumo.
      // Версия запинена точно в package.json; единственная точка импорта —
      // src/core/crypto/sodium.ts. Проверить этот путь при обновлении пакета.
      'libsodium-wrappers-sumo': fileURLToPath(
        new URL(
          './node_modules/libsodium-wrappers-sumo/dist/modules-sumo/libsodium-wrappers.js',
          import.meta.url,
        ),
      ),
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@modules': fileURLToPath(new URL('./src/modules', import.meta.url)),
      '@app': fileURLToPath(new URL('./src/app', import.meta.url)),
    },
  },
  plugins: [react(), prodCspPlugin(), VitePWA({
    registerType: 'prompt',
    manifest: {
      name: 'Notes Vault',
      short_name: 'Notes',
      description: 'Приватные зашифрованные заметки, офлайн-first.',
      lang: 'ru',
      theme_color: '#0f172a',
      background_color: '#0f172a',
      display: 'standalone',
      orientation: 'portrait',
      icons: [
        {
          src: 'pwa-192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: 'pwa-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: 'maskable-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
    workbox: {
      // Прекэш кода/оболочки/иконок для офлайна (libsodium-WASM инлайнится в JS).
      globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm,webmanifest}'],
      // SPA-офлайн: неизвестный маршрут отдаём из index.html.
      navigateFallback: 'index.html',
      navigateFallbackDenylist: [/^\/(?:registerSW\.js|sw\.js|workbox-)/],
      cleanupOutdatedCaches: true,
      clientsClaim: true,
    },
  }), cloudflare()],
})