import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1600, height: 1000 } });

for (const theme of ['light', 'dark'] as const) {
  test(`react nodes reference state (${theme})`, async ({ page }) => {
    await page.goto(`./?static&theme=${theme}#/react-nodes`);
    const canvas = page.getByTestId('react-nodes-canvas');
    await expect(canvas.locator('.rn-reading')).toHaveCount(3);
    await expect(canvas.locator('.rn-unit')).toHaveCount(1);
    await page.evaluate(() => document.fonts.ready);
    await expect(canvas).toHaveScreenshot(`react-nodes-${theme}.png`);
  });
}

test('the library draws the ports of React nodes and routes to them', async ({ page }) => {
  await page.goto('./?static#/react-nodes');
  const canvas = page.getByTestId('react-nodes-canvas');
  await expect(canvas.locator('[data-node-id="E1"] .pv-port')).toHaveCount(3);
  await expect(canvas.locator('[data-node-id="TT102"] [data-port-id="signal"]')).toHaveCount(1);
  await expect(canvas.locator('[data-link-id="s3"] .pv-link-line')).toHaveAttribute('d', /^M/);
});

test('a data tick re-renders only the cards whose data changed', async ({ page }) => {
  await page.clock.install();
  await page.goto('./#/react-nodes');
  await expect(page.getByTestId('renders-FT-101')).toHaveText('renders: 1');
  // FT-101 changes every tick, TT-102 and E-101 every 2nd, LT-101 every 3rd.
  await page.clock.runFor(6_000);
  await expect(page.getByText('Tick 6')).toBeVisible();
  await expect(page.getByTestId('renders-FT-101')).toHaveText('renders: 7');
  await expect(page.getByTestId('renders-TT-102')).toHaveText('renders: 4');
  await expect(page.getByTestId('renders-LT-101')).toHaveText('renders: 3');
  await expect(page.getByTestId('renders-E-101')).toHaveText('renders: 4 · 3 ports');
});

test('content sizing: a longer label widens the card and moves its port', async ({ page }) => {
  await page.goto('./?static#/react-nodes');
  const port = page.locator('[data-node-id="TT102"] [data-port-id="signal"]');
  const before = Number(await port.getAttribute('cx'));
  await page.getByRole('button', { name: 'Long label' }).click();
  await expect.poll(async () => Number(await port.getAttribute('cx'))).toBeGreaterThan(before + 20);
});

test('selection reaches the component', async ({ page }) => {
  await page.goto('./?static#/react-nodes');
  const card = page.locator('.rn-reading').filter({ hasText: 'FT-101' });
  await card.click();
  await expect(card).toHaveAttribute('data-selected', 'true');
});
