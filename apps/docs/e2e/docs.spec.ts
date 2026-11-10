import { expect, test } from '@playwright/test';

const PAGES = [
  ['getting-started', 'Getting started'],
  ['theming', 'Theming'],
  ['custom-symbols', 'Custom symbols'],
  ['api', 'API reference'],
] as const;

for (const [path, title] of PAGES) {
  test(`docs page ${path} renders without errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`./#/${path}`);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole('link', { name: title })).toHaveAttribute('aria-current', 'page');
    expect(errors).toEqual([]);
  });
}

test('theme toggle switches data-theme and announces its state', async ({ page }) => {
  await page.goto('./?theme=light#/theming');
  const toggle = page.getByRole('button', { name: 'Dark theme' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Light theme' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('custom symbol example renders with its ports', async ({ page }) => {
  await page.goto('./#/custom-symbols');
  const card = page.locator('[data-type="water/uv-reactor"]');
  await expect(card.locator('.symbol-port')).toHaveCount(2);
});
