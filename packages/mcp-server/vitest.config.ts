import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      enabled: true,
      provider: 'istanbul',
      reportOnFailure: true,
      // Count every source file, not only the ones a test happened to import.
      include: ['src/**/*.ts'],
      reporter: [['lcov', {}], ['text']],
      // Ratchet: set at what the suite actually reaches, raise it with every pull request that
      // adds coverage, never lower it to make a run pass. Lower than the 90/85 the browser
      // packages carry because `index.ts` is the stdio entry point — it starts a server
      // process, so it cannot execute inside the test run — and `scaffold/create-app.ts`
      // shells out to the real generator.
      thresholds: {
        lines: 82,
        statements: 82,
        functions: 85,
        branches: 68,
      },
    },
  },
});
