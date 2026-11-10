import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1600, height: 900 } });

for (const theme of ['light', 'dark'] as const) {
  test(`process monitor matches the Figma reference state (${theme})`, async ({ page }) => {
    await page.goto(`./?static&theme=${theme}#/monitor`);
    const canvas = page.getByTestId('monitor-canvas');
    await expect(canvas.locator('.reading-card')).toHaveCount(4);
    await page.evaluate(() => document.fonts.ready);
    await expect(canvas).toHaveScreenshot(`monitor-${theme}.png`);
  });
}

test('shows the four example statuses with text, not colour alone', async ({ page }) => {
  await page.goto('./?static#/monitor');
  const canvas = page.getByTestId('monitor-canvas');
  await expect(canvas.locator('.reading-card[data-status="normal"]')).toHaveCount(2);
  await expect(canvas.getByText('Within range')).toHaveCount(2);
  await expect(canvas.locator('.reading-card[data-status="alarm"]')).toContainText('! Low flow');
  await expect(canvas.locator('.reading-card[data-status="warning"]')).toContainText(
    '△ Low temperature',
  );
});

test('live data ticks at 1 Hz through setNodeDataBatch', async ({ page }) => {
  await page.clock.install();
  await page.goto('./?theme=light#/monitor');
  const card = page.locator('.reading-card[aria-label="TI-101 · MHWT"]');
  await expect(card).toContainText('14.0');
  await page.clock.runFor(30_000);
  await expect(page.getByText('Tick 30')).toBeVisible();
  await page.getByRole('button', { name: 'Pause data' }).click();
  await expect(page.getByText('Paused')).toBeVisible();
});

// fixme: core captures the pointer on pointerdown for panning, so Chrome retargets the click to the root and
// view-mode clicks never select. Reported to the core owner; un-fixme with the core fix.
test.fixme('clicking equipment selects it', async ({ page }) => {
  await page.goto('./?static#/monitor');
  // The casing stroke (left edge of the impeller circle). Clicking the open middle needs a node hit
  // area in core; switch to a plain .click() once that lands.
  const casing = page.locator('[data-node-id="P03"] .pv-symbol path').first();
  const box = (await casing.boundingBox())!;
  await casing.click({ position: { x: 1, y: box.height / 2 } });
  await expect(page.getByText('selected. A host app')).toContainText('P03');
});
