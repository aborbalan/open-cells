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
