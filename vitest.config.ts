import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // World generation and multi-season runs are genuinely slow; the default
    // 5s timeout fails them for no good reason.
    testTimeout: 120_000,
  },
})
