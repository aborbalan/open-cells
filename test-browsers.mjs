/**
 * Which browsers a test run covers, and where their binaries are.
 *
 * The repository drives browsers from three different runners — vitest for the unit suites,
 * web-test-runner for `localize`, Playwright for the end-to-end suite. They answer to the same two
 * environment variables so that "run the suite on WebKit" is one thing to know rather than three:
 *
 * - `OPEN_CELLS_BROWSERS` — comma separated, e.g. `chromium,webkit`. Each runner has its own default:
 *   one browser is enough to know whether a unit change works, while the end-to-end suite defaults
 *   to all three because that is the point of it.
 * - `OPEN_CELLS_<BROWSER>_EXECUTABLE` — an already-installed binary to use instead of the one
 *   Playwright downloads, for images that provision their own
 *   (`OPEN_CELLS_CHROMIUM_EXECUTABLE=/opt/browsers/chromium`). Unset, Playwright resolves its own,
 *   as before.
 */

export const SUPPORTED_BROWSERS = ['chromium', 'firefox', 'webkit'];

/**
 * The browsers this run should cover.
 *
 * @param {string[]} fallback What to use when `OPEN_CELLS_BROWSERS` is unset.
 */
export function requestedBrowsers(fallback = ['chromium']) {
  const configured = process.env.OPEN_CELLS_BROWSERS;
  const requested = configured
    ? configured
        .split(',')
        .map(name => name.trim().toLowerCase())
        .filter(Boolean)
    : fallback;

  const unknown = requested.filter(name => !SUPPORTED_BROWSERS.includes(name));
  if (unknown.length) {
    throw new Error(
      `OPEN_CELLS_BROWSERS: unknown browser ${unknown.join(', ')}. ` +
        `Supported: ${SUPPORTED_BROWSERS.join(', ')}.`,
    );
  }
  if (!requested.length) {
    throw new Error('OPEN_CELLS_BROWSERS is set but names no browser.');
  }
  return requested;
}

/** An already-installed binary to use for a browser, if the environment provides one. */
export function browserExecutable(browser) {
  return process.env[`OPEN_CELLS_${browser.toUpperCase()}_EXECUTABLE`];
}
