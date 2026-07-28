/// <reference types="vitest" />
import { defineConfig } from 'vite'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
  test: {
    globals: true,
    browser: {
      provider: playwright(),
      enabled: true,
      instances: [
        { browser: 'chromium' }
      ],
    },
    coverage: {
      enabled: true,
      provider: 'istanbul',
      reportOnFailure: true,
      // Count every source file, not only the ones a test happened to import.
      include: ['src/**/*.js'],
      reporter: [
        ['lcov', { 'projectRoot': './src' }],
        ['text']
      ],
      // Ratchet: raise it with every PR that adds coverage, never lower it.
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 85,
      }
    }
  },
})
