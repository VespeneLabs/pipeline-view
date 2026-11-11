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

test('clicking equipment selects it', async ({ page }) => {
  await page.goto('./?static#/monitor');
  await page.locator('[data-node-id="P03"]').click();
  await expect(page.getByText('selected. A host app')).toContainText('P03');
});

test('reading cards can be dragged in view mode as display state', async ({ page }) => {
  await page.goto('./?static#/monitor');
  // Runs in the page: reads the demo's diagram (window.__diagram).
  const read = <T>(expr: string) =>
    page.evaluate<T>(`(() => { const d = window.__diagram; return ${expr}; })()`);
  const position = (id: string) =>
    read<{ x: number; y: number }>(`d.getAnnotationPosition(${JSON.stringify(id)})`);
  const card = page.locator('.reading-card[aria-label="TI-101 · MHWT"]');
  const slot = page.locator('.pv-overlay [data-draggable]').filter({ has: card });
  await expect(slot).toHaveCount(1);
  const id = (await slot.getAttribute('data-annotation-id'))!;
  const before = await read<string>('JSON.stringify(d.toJSON())');
  const viewport = await read<{ zoom: number }>('d.getViewport()');
  const start = await position(id);
  const zoom = viewport.zoom;

  const box = (await slot.boundingBox())!;
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 30, from.y + 10, { steps: 4 });
  await page.mouse.move(from.x + 60, from.y + 20, { steps: 4 });
  await page.mouse.up();

  const moved = await position(id);
  expect(moved.x).toBeCloseTo(start.x + 60 / zoom, 0);
  expect(moved.y).toBeCloseTo(start.y + 20 / zoom, 0);
  const after = (await slot.boundingBox())!;
  expect(after.x).toBeCloseTo(box.x + 60, 0);
  // Display state: the document, history, dirty flag, viewport and selection are untouched.
  expect(await read('JSON.stringify(d.toJSON())')).toBe(before);
  expect(await read('[d.canUndo(), d.isDirty()]')).toEqual([false, false]);
  expect(await read('d.getViewport()')).toEqual(viewport);
  await expect(page.getByText('selected. A host app')).toContainText('FCV101');
  await expect(card).toBeVisible(); // the React card is still mounted in the same slot

  // Keyboard: focus the card, move it, commit.
  await slot.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(slot).toHaveAttribute('aria-label', 'TI-101 · MHWT'); // annotationName
  await expect(page.locator('.pv-live')).toHaveText('Moved TI-101 · MHWT.');
  expect((await position(id)).x).toBeCloseTo(moved.x + 1, 5);

  await page.getByRole('button', { name: 'Reset cards' }).click();
  expect(await position(id)).toEqual(start);
  await expect.poll(async () => (await slot.boundingBox())!.x).toBeCloseTo(box.x, 0);
});
