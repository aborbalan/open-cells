/**
 * The browser test setup the vitest packages share.
 *
 * Six packages were carrying near-identical copies of the same configuration, which is how a
 * browser matrix or a coverage reporter ends up applied to five of them. This is the one place that
 * decides how a suite runs; a package only says what it covers and how much.
 *
 * Browser selection and browser binaries come from `./test-browsers.mjs`, shared with the other two
 * runners in the repository.
 */

import { playwright } from '@vitest/browser-playwright';
import { browserExecutable, requestedBrowsers } from './test-browsers.mjs';

function instanceFor(browser) {
  const executablePath = browserExecutable(browser);
  // Each instance carries its own provider, so the override is per browser rather than one
  // executable applied to the whole matrix.
  return executablePath
    ? { browser, provider: playwright({ launchOptions: { executablePath } }) }
    : { browser };
}

/**
 * A vitest `test` block for a package whose suite runs in a real browser.
 *
 * @param {object} options
 * @param {string[]} [options.include] Sources the coverage report must count — every source file,
 *   not only the ones a test happened to import.
 * @param {object} options.thresholds The coverage floor. A ratchet: raise it with every pull
 *   request that adds coverage, never lower it to make a run pass.
 * @param {object[]} [options.extraReporters] Coverage reporters this package needs on top of the
 *   shared ones.
 */
export function browserTestConfig({ include = ['src/**/*.js'], thresholds, extraReporters = [] }) {
  return {
    globals: true,
    browser: {
      provider: playwright(),
      enabled: true,
      // vitest only defaults to headless when it detects CI, so a local run would try to open
      // a window and fail on any machine without a display. Pass `--browser.headless=false`
      // to watch a run.
      headless: true,
      instances: requestedBrowsers().map(instanceFor),
    },
    coverage: {
      enabled: true,
      provider: 'istanbul',
      reportOnFailure: true,
      include,
      // Paths stay relative to the package root so the combined report can tell
      // `core-plugin/src/index.js` from `page-mixin/src/index.js`.
      reporter: [['lcov', {}], ['text'], ...extraReporters],
      thresholds,
    },
  };
}

/** The floor agreed for the packages built on top of the bridge. */
export const DEFAULT_THRESHOLDS = {
  lines: 90,
  statements: 90,
  functions: 90,
  branches: 85,
};
