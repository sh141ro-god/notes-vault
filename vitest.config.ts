import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // Тот же обход сломанной ESM-сборки libsodium, что и в vite.config.ts.
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
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
