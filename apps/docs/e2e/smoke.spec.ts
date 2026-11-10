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
  'react-nodes',
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

/**
 * FR-55 with a real Web Worker (not the unit tests' fake): the worker file must load through the
 * bundler in both the production build and the dev server, and its routes must be adopted.
 */
test('#/stress routes the initial pass in a real Worker', async ({ page }) => {
  const errors: string[] = [];
  const workers: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  page.on('worker', (w) => workers.push(w.url()));
  await page.goto('./#/stress');
  await expect(page.locator('main h1')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('toggle-worker').click();
  await expect(page.getByTestId('toggle-worker')).toHaveText('Worker routing on');
  await expect(page.getByTestId('stress-routes-ready')).toHaveText(/^\d+ ms \(worker\)$/, {
    timeout: 15_000,
  });
  expect(workers.some((u) => u.includes('routing.worker'))).toBe(true);
  // Routed, not a straight placeholder: an orthogonal route between offset ports has bends.
  const points = await page.evaluate(() => {
    const s = (
      window as unknown as { __stress: { diagram: { getLinkPath(id: string): unknown[] } } }
    ).__stress;
    return s.diagram.getLinkPath('l0')!.length;
  });
  expect(points).toBeGreaterThan(2);
  expect(errors).toEqual([]);
});
