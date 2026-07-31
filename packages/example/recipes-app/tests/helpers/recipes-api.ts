import type { Page, Route } from '@playwright/test';
import { CATEGORIES, MEALS_BY_CATEGORY, MEAL_DETAILS, RANDOM_MEAL } from '../fixtures/meals.js';

const API_PATTERN = 'https://www.themealdb.com/api/**';
const IMAGE_PATTERN = 'https://www.themealdb.com/images/**';

/** A 1x1 transparent GIF, so the pages can render their images without leaving the machine. */
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

/** Everything the suite has asked the API for, in order. */
export type ApiCallLog = string[];

/**
 * Serves the recipes API from local fixtures for the lifetime of the page.
 *
 * Without this the suite depends on a free third-party service being up, not rate-limiting and
 * never changing its catalogue — none of which the repository controls, and all of which show
 * up as a red build nobody caused.
 *
 * @returns The list of API paths the application requested, which lets a test assert on
 *   caching behaviour — that a second visit to a page does not fetch again, for instance.
 */
export async function mockRecipesApi(page: Page): Promise<ApiCallLog> {
  const calls: ApiCallLog = [];

  await page.route(IMAGE_PATTERN, (route: Route) =>
    route.fulfill({ contentType: 'image/gif', body: TRANSPARENT_GIF }),
  );

  await page.route(API_PATTERN, (route: Route) => {
    const url = new URL(route.request().url());
    const endpoint = url.pathname.split('/').pop();
    calls.push(`${endpoint}${url.search}`);

    const json = (body: unknown) => route.fulfill({ json: body });

    switch (endpoint) {
      case 'categories.php':
        return json({ categories: CATEGORIES });

      case 'random.php':
        return json({ meals: [RANDOM_MEAL] });

      case 'filter.php': {
        const category = url.searchParams.get('c') ?? '';
        return json({ meals: MEALS_BY_CATEGORY[category] ?? null });
      }

      case 'lookup.php': {
        const id = url.searchParams.get('i') ?? '';
        const meal = MEAL_DETAILS[id];
        return json({ meals: meal ? [meal] : null });
      }

      default:
        // Anything the app starts calling that is not mapped should fail loudly rather
        // than quietly reach the network.
        return route.fulfill({ status: 501, json: { error: `unmapped endpoint ${endpoint}` } });
    }
  });

  return calls;
}

/**
 * Cuts the browser off from anything that is not the app itself or one of the intercepted
 * recipe endpoints, so a test can show the page still renders with no network at all.
 *
 * Register it after `mockRecipesApi`: Playwright runs the most recently added handler first,
 * and requests that should reach the fixtures are passed on with `fallback()`.
 */
export async function forbidExternalRequests(page: Page): Promise<void> {
  await page.route('**://**', (route: Route) => {
    const url = route.request().url();
    const handledElsewhere =
      url.startsWith('http://localhost') ||
      url.startsWith('data:') ||
      url.startsWith('https://www.themealdb.com');

    return handledElsewhere ? route.fallback() : route.abort('blockedbyclient');
  });
}
