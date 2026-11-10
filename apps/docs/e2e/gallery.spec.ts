import { expect, test } from '@playwright/test';

for (const theme of ['light', 'dark'] as const) {
  test(`symbol gallery (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`./?theme=${theme}#/gallery`);
    await expect(page.locator('.symbol-card')).toHaveCount(53);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page).toHaveScreenshot(`gallery-${theme}.png`, { fullPage: true });
  });
}

test('gallery filter narrows the symbols', async ({ page }) => {
  await page.goto('./#/gallery');
  await page.getByLabel('Filter symbols').fill('compressor');
  await expect(page.locator('.symbol-card')).toHaveCount(3);
});
