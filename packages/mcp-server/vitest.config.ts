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
      // `index.ts` stays in the denominator on purpose rather than being excluded. It used to
      // hold the argument parsing too, which made its 0 % an argument instead of a fact; that
      // moved to `cli.ts`, which the suite covers at 100 %. What is left is twenty lines that
      // connect a transport to stdio and cannot run inside a test, so counting them costs
      // little and keeps the file honest: the day logic creeps back in, the number drops.
      //
      // Ratchet: set at what the suite actually reaches, raise it with every pull request that
      // adds coverage, never lower it to make a run pass. Still under the 90/85 the browser
      // packages carry because of that entry point and because `scaffold/create-app.ts` shells
      // out to the real generator.
      thresholds: {
        lines: 83,
        statements: 83,
        functions: 86,
        branches: 70,
      },
    },
  },
});
