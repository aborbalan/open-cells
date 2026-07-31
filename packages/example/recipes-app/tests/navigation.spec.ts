import { expect, test } from '@playwright/test';
import { mockRecipesApi } from './helpers/recipes-api.js';
import { MEALS_BY_CATEGORY, RANDOM_MEAL, SEAFOOD_MEAL } from './fixtures/meals.js';

/**
 * What the framework is for: mapping URLs to page components, carrying route params into
 * them, and keeping the navigation stack straight. These go through the rendered content
 * rather than the address bar, so a route that resolves to the wrong page fails here.
 */

test.beforeEach(async ({ page }) => {
  await mockRecipesApi(page);
  await page.goto('/');
});

/** Opens the named category from the home page and waits for it to render. */
async function openCategory(page: import('@playwright/test').Page, name: string) {
  await page.locator('.categories-list .category-item', { hasText: name }).click();
  await expect(page.locator('category-page .page-header h2')).toHaveText(name);
}

test('routes a category link to the category page with its param', async ({ page }) => {
  await openCategory(page, 'Beef');

  expect(page.url()).toBe('http://localhost:4173/#!/category/beef');
  await expect(page.locator('category-page')).toBeVisible();
  await expect(page.locator('category-page .categories-description')).toHaveText(
    'Beef is the culinary name for meat from cattle.',
  );
});

test('lists the recipes of the category it was given', async ({ page }) => {
  await openCategory(page, 'Beef');

  const titles = page.locator('category-page .category .recipe-title');
  await expect(titles).toHaveCount(MEALS_BY_CATEGORY.Beef.length);
  await expect(titles).toHaveText(MEALS_BY_CATEGORY.Beef.map(meal => meal.strMeal));
});

test('routes a different category to the same page with a different param', async ({ page }) => {
  await openCategory(page, 'Seafood');

  expect(page.url()).toBe('http://localhost:4173/#!/category/seafood');
  const titles = page.locator('category-page .category .recipe-title');
  await expect(titles).toHaveText(MEALS_BY_CATEGORY.Seafood.map(meal => meal.strMeal));
});

test('routes a recipe link to the recipe page and renders that recipe', async ({ page }) => {
  await openCategory(page, 'Seafood');
  await page.locator('category-page .recipe-title', { hasText: SEAFOOD_MEAL.strMeal }).click();

  await expect(page).toHaveURL(`http://localhost:4173/#!/recipe/${SEAFOOD_MEAL.idMeal}`);
  await expect(page.locator('recipe-page .page-header h2')).toHaveText(SEAFOOD_MEAL.strMeal);
  await expect(page.locator('recipe-page .ingredients-list li p').first()).toHaveText('Fennel');
});

test('reloads the recipe when the route param changes', async ({ page }) => {
  await page.goto(`/#!/recipe/${SEAFOOD_MEAL.idMeal}`);
  await expect(page.locator('recipe-page .page-header h2')).toHaveText(SEAFOOD_MEAL.strMeal);

  await page.goto(`/#!/recipe/${RANDOM_MEAL.idMeal}`);
  await expect(page.locator('recipe-page .page-header h2')).toHaveText(RANDOM_MEAL.strMeal);
});

test('renders a page addressed directly by URL', async ({ page }) => {
  await page.goto('/#!/category/dessert');

  await expect(page.locator('category-page .page-header h2')).toHaveText('Dessert');
  await expect(page.locator('category-page .category .recipe-title')).toHaveText(
    MEALS_BY_CATEGORY.Dessert.map(meal => meal.strMeal),
  );
});

test('goes back home from a category', async ({ page }) => {
  await openCategory(page, 'Beef');

  await page.locator('category-page md-outlined-button[aria-label="Back to home"]').click();

  await expect(page).toHaveURL('http://localhost:4173/#!/');
  await expect(page.locator('home-page')).toBeVisible();
});

test('goes back to the category of a recipe from the recipe page', async ({ page }) => {
  await openCategory(page, 'Seafood');
  await page.locator('category-page .recipe-title', { hasText: SEAFOOD_MEAL.strMeal }).click();
  await expect(page.locator('recipe-page .page-header h2')).toHaveText(SEAFOOD_MEAL.strMeal);

  await page.locator('recipe-page .page-header-actions md-outlined-button').click();

  await expect(page).toHaveURL('http://localhost:4173/#!/category/seafood');
  await expect(page.locator('category-page .page-header h2')).toHaveText('Seafood');
});

test('the browser back button walks the navigation stack', async ({ page }) => {
  await openCategory(page, 'Beef');
  await page.locator('category-page .recipe-title', { hasText: RANDOM_MEAL.strMeal }).click();
  await expect(page.locator('recipe-page .page-header h2')).toHaveText(RANDOM_MEAL.strMeal);

  await page.goBack();
  await expect(page).toHaveURL('http://localhost:4173/#!/category/beef');
  await expect(page.locator('category-page .page-header h2')).toHaveText('Beef');

  // The first entry is the URL the app was opened on, which carries no hash yet.
  await page.goBack();
  await expect(page).toHaveURL('http://localhost:4173/');
  await expect(page.locator('home-page')).toBeVisible();
});

test('the browser forward button returns down the stack', async ({ page }) => {
  await openCategory(page, 'Beef');
  await page.goBack();
  await expect(page.locator('home-page')).toBeVisible();

  await page.goForward();

  await expect(page).toHaveURL('http://localhost:4173/#!/category/beef');
  await expect(page.locator('category-page .page-header h2')).toHaveText('Beef');
});

test('keeps a page alive in the cache while another is on screen', async ({ page }) => {
  await openCategory(page, 'Beef');
  await page.locator('category-page .recipe-title', { hasText: RANDOM_MEAL.strMeal }).click();
  await expect(page.locator('recipe-page')).toHaveAttribute('state', 'active');

  // The bridge keeps the templates it has built; the one that left is no longer active.
  await expect(page.locator('category-page')).not.toHaveAttribute('state', 'active');
  await expect(page.locator('category-page')).toHaveCount(1);
});

test('leaves an unmatched URL alone, because the app declares no 404 route', async ({ page }) => {
  await expect(page.locator('home-page')).toBeVisible();

  await page.goto('/#!/no-such-page');

  // routes.ts marks its not-found route `notFound: false`, so the router has no 404 to
  // fall back to and nothing is selected. Recorded here as the current behaviour.
  await expect(page.locator('not-found-page')).toHaveCount(0);
  expect(page.url()).toBe('http://localhost:4173/#!/no-such-page');
});

test('renders the not-found page when it is addressed by its own route', async ({ page }) => {
  await page.goto('/#!/not-found');

  await expect(page.locator('not-found-page')).toBeVisible();
});
