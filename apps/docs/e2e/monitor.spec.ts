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

test('the right button pans, and a left drag on the background selects with a box', async ({
  page,
}) => {
  await page.goto('./?static#/monitor');
  const read = <T>(expr: string) =>
    page.evaluate<T>(`(() => { const d = window.__diagram; return ${expr}; })()`);
  await expect(page.locator('[data-node-id="P03"]')).toBeVisible();
  await read('(window.__menus = 0, d.on("contextMenu", () => window.__menus++), 0)');
  const box = (await page.getByTestId('monitor-canvas').boundingBox())!;
  const corner = { x: box.x + 6, y: box.y + 6 };
  const before = await read<{ x: number; y: number }>('d.getViewport()');

  // Right drag: the view moves, and neither the browser's menu nor contextMenu gets in the way.
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(corner.x + 40, corner.y + 20, { steps: 4 });
  await page.mouse.move(corner.x + 80, corner.y + 30, { steps: 4 });
  await page.mouse.up({ button: 'right' });
  const panned = await read<{ x: number; y: number }>('d.getViewport()');
  expect(panned.x).toBeCloseTo(before.x + 80, 0);
  expect(panned.y).toBeCloseTo(before.y + 30, 0);
  expect(await read<number>('window.__menus')).toBe(0);

  // A right click that doesn't move still raises contextMenu, once.
  await page.mouse.click(corner.x, corner.y, { button: 'right' });
  expect(await read<number>('window.__menus')).toBe(1);

  // Left drag across the whole canvas: a selection box, no pan, and what is under it selected.
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.mouse.move(corner.x + 200, corner.y + 200, { steps: 4 });
  await expect(page.locator('.pv-marquee')).toBeVisible();
  await page.mouse.move(box.x + box.width - 6, box.y + box.height - 6, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('.pv-marquee')).toHaveCount(0);
  expect(await read<{ x: number; y: number }>('d.getViewport()')).toEqual(panned);
  const selection = await read<{ kind: string }[]>('d.getSelection()');
  expect(selection.length).toBeGreaterThan(1);
  expect(selection.every((i) => i.kind === 'node')).toBe(true);
});
