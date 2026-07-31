import { expect, test } from '@playwright/test';
import { mockRecipesApi } from './helpers/recipes-api.js';
import { RANDOM_MEAL, SEAFOOD_MEAL } from './fixtures/meals.js';

/**
 * The other half of what the framework does: pages that never import each other sharing
 * state through named channels. Favouriting a recipe on one page has to be visible on the
 * next one without either knowing the other exists.
 */

test.beforeEach(async ({ page }) => {
  await mockRecipesApi(page);
  await page.goto('/');
});

/** The heart button of the daily special on the home page. */
function favouriteToggle(page: import('@playwright/test').Page) {
  return page.locator('home-page .banner-text-actions md-outlined-icon-button');
}

/**
 * The counter in the "favorite recipes" button of whichever page is on screen. The Material
 * button renders its own <button> in a shadow root, so this reads the custom element itself.
 */
function favouriteCounter(page: import('@playwright/test').Page, pageTag: string) {
  return page.locator(`${pageTag} md-outlined-button[aria-label="favorite recipes"]`);
}

test('publishing a favourite updates the counter on the same page', async ({ page }) => {
  await expect(favouriteCounter(page, 'home-page')).toContainText('0');

  await favouriteToggle(page).click();

  await expect(favouriteCounter(page, 'home-page')).toContainText('1');
});

test('a favourite published on one page is visible on the next', async ({ page }) => {
  await favouriteToggle(page).click();
  await expect(favouriteCounter(page, 'home-page')).toContainText('1');

  await page.locator('.categories-list .category-item', { hasText: 'Beef' }).click();

  await expect(favouriteCounter(page, 'category-page')).toContainText('1');
});

test('the recipe that was favourited shows as selected wherever it appears', async ({ page }) => {
  await favouriteToggle(page).click();

  await page.locator('.categories-list .category-item', { hasText: 'Beef' }).click();
  await expect(page.locator('category-page .page-header h2')).toHaveText('Beef');

  const favourited = page
    .locator('category-page .category', { hasText: RANDOM_MEAL.strMeal })
    .locator('md-outlined-icon-button');
  await expect(favourited).toHaveAttribute('selected', '');
});

test('a recipe that was not favourited stays unselected', async ({ page }) => {
  await favouriteToggle(page).click();

  await page.locator('.categories-list .category-item', { hasText: 'Beef' }).click();
  const other = page
    .locator('category-page .category', { hasText: 'Beef and Mustard Pie' })
    .locator('md-outlined-icon-button');

  await expect(other).not.toHaveAttribute('selected', '');
});

test('the favourites survive a full reload', async ({ page }) => {
  await favouriteToggle(page).click();
  await expect(favouriteCounter(page, 'home-page')).toContainText('1');

  await page.reload();

  // app-index writes the channel to localStorage and republishes it on start-up.
  await expect(favouriteCounter(page, 'home-page')).toContainText('1');
});

test('lists the favourites on the favourites page', async ({ page }) => {
  await favouriteToggle(page).click();

  await page.locator('home-page md-outlined-button[aria-label="favorite recipes"]').click();

  await expect(page).toHaveURL('http://localhost:4173/#!/favorite-recipes');
  await expect(page.locator('favorite-recipes-page')).toContainText(RANDOM_MEAL.strMeal);
});

test('removing a favourite is seen by the other pages too', async ({ page }) => {
  await favouriteToggle(page).click();
  await expect(favouriteCounter(page, 'home-page')).toContainText('1');

  await favouriteToggle(page).click();
  await expect(favouriteCounter(page, 'home-page')).toContainText('0');

  await page.locator('.categories-list .category-item', { hasText: 'Seafood' }).click();
  await expect(favouriteCounter(page, 'category-page')).toContainText('0');
});

test('a page does not refetch what a channel already carries', async ({ page }) => {
  const calls = await mockRecipesApi(page);
  await page.goto('/');
  await expect(page.locator('.categories-list .category-item').first()).toBeVisible();

  const categoriesCallsAfterHome = calls.filter(call => call.startsWith('categories.php')).length;

  await page.locator('.categories-list .category-item', { hasText: 'Seafood' }).click();
  await expect(page.locator('category-page .page-header h2')).toHaveText('Seafood');

  // The category page reads the list off the `categories` channel the home page published.
  expect(calls.filter(call => call.startsWith('categories.php')).length).toBe(
    categoriesCallsAfterHome,
  );
  expect(page.url()).toContain(`/category/${SEAFOOD_MEAL.strCategory.toLowerCase()}`);
});

