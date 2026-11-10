import { expect, test } from '@playwright/test';

/**
 * Every docs and demo page must load without console errors or uncaught exceptions. Runs against both
 * the production build and the dev server (StrictMode), see playwright.config.ts.
 */
const ROUTES = [
  'getting-started',
  'theming',
  'custom-symbols',
  'controlled-guide',
  'testing',
  'monitor',
  'editor',
  'controlled',
  'review',
  'stress',
  'api',
  'gallery',
];

for (const route of ROUTES) {
  test(`#/${route} loads without console errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
    });
    await page.goto(`./#/${route}`);
    // Generous: the first dev-server load pre-bundles dependencies.
    await expect(page.locator('main h1')).toBeVisible({ timeout: 30_000 });
    // Let mount effects, the first render frames and a 1 Hz data tick run.
    await page.waitForTimeout(1500);
    // Toggle the theme too: a theme change re-renders every diagram.
    await page.locator('.theme-toggle').click();
    await page.waitForTimeout(300);
    expect(errors).toEqual([]);
  });
}
