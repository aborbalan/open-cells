import { playwrightLauncher } from '@web/test-runner-playwright';
import { browserExecutable, requestedBrowsers } from '../../test-browsers.mjs';

// This package runs on web-test-runner rather than vitest, but it answers to the same two
// knobs as every other suite: OPEN_CELLS_BROWSERS and OPEN_CELLS_<BROWSER>_EXECUTABLE.
const launchers = requestedBrowsers().map(product => {
  const executablePath = browserExecutable(product);
  return playwrightLauncher({
    product,
    launchOptions: {
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    },
    contextOptions: {
      // Start every run from empty browser storage.
      storageState: {},
    },
  });
});

export default {
  files: 'test/**/*.test.js',
  nodeResolve: true,
  watch: false,
  browsers: launchers,
  coverage: true,
  coverageConfig: {
    reportDir: 'coverage',
    // No `exclude` here on purpose, and it is worth saying why so nobody spends the
    // afternoon again: on Windows it cannot work. `@web/test-runner-coverage-v8`
    // builds the path with `path.join` — backslashes — and matches it with picomatch,
    // which reads a backslash as an escape. No pattern matches, including the
    // `**/node_modules/**/*` the runner ships by default. Verified against picomatch
    // directly. So a dependency must be kept out of `rootDir`, not filtered out of the
    // report: any `node_modules` inside this package gets instrumented as if it were
    // ours. `sinon` is 10.647 instrumented lines against roughly 1.000 of our own.
    // Ratchet: raise it with every PR that adds coverage, never lower it.
    threshold: {
      statements: 95,
      branches: 95,
      functions: 95,
      lines: 95,
    },
  },
  testFramework: {
    config: {
      timeout: '20000',
    },
  },
};
