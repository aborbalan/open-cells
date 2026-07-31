import { expect, test } from '@playwright/test';
import { forbidExternalRequests, mockRecipesApi } from './helpers/recipes-api.js';
import { CATEGORIES, RANDOM_MEAL } from './fixtures/meals.js';

test.beforeEach(async ({ page }) => {
  await mockRecipesApi(page);
  await page.goto('/');
});

test('opens on the home page', async ({ page }) => {
  await expect(page).toHaveTitle(/Example App/);
  expect(page.url()).toBe('http://localhost:4173/');
  await expect(page.locator('home-page')).toBeVisible();
});

test('shows the daily special once its recipe has loaded', async ({ page }) => {
  const banner = page.locator('.banner');

  await expect(banner.locator('.recipe-title')).toHaveText(RANDOM_MEAL.strMeal);
  await expect(banner.locator('img')).toHaveAttribute('alt', RANDOM_MEAL.strMeal);
});

test('lists every category the service returns, in alphabetical order', async ({ page }) => {
  const items = page.locator('.categories-list .category-item');

  await expect(items).toHaveCount(CATEGORIES.length);
  await expect(items.locator('p')).toHaveText(
    [...CATEGORIES].map(category => category.strCategory).sort(),
  );
});

test('starts with no favourite recipes', async ({ page }) => {
  // The Material button renders its own <button> in a shadow root, so the counter has to be
  // read off the custom element rather than off the ARIA role.
  const favourites = page.locator('home-page md-outlined-button[aria-label="favorite recipes"]');
  await expect(favourites).toContainText('0');
});

test('toggles dark mode on and off', async ({ page }) => {
  const root = page.locator('html');
  const toggle = page.getByRole('button', { name: 'Dark Mode' });

  await expect(root).not.toHaveAttribute('color-scheme-dark');

  await toggle.click();
  await expect(root).toHaveAttribute('color-scheme-dark', 'true');

  await toggle.click();
  await expect(root).not.toHaveAttribute('color-scheme-dark');
});

test('renders with every off-origin request blocked', async ({ page }) => {
  // Proves the suite is self-contained: with the network cut off at the browser, the app
  // still renders, so nothing it shows depends on a third party being up.
  await forbidExternalRequests(page);

  await page.goto('/');

  await expect(page.locator('.banner .recipe-title')).toHaveText(RANDOM_MEAL.strMeal);
  await expect(page.locator('.categories-list .category-item')).toHaveCount(CATEGORIES.length);
});
