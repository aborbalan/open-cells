import { playwrightLauncher } from '@web/test-runner-playwright';

export default {
  files: 'test/**/*.test.js',
  nodeResolve: true,
  watch: false,
  browsers: [
    playwrightLauncher({
      product: 'chromium',
      launchOptions: {
        headless: true,
      },
      contextOptions: {
        // Start every run from empty browser storage.
        storageState: {},
      },
    }),
  ],
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
