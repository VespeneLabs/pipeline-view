import type { Diagram } from '@pipeline-view/core';
import { expect, test } from '@playwright/test';

type Win = { __diagram: Diagram };

test.use({ viewport: { width: 1600, height: 1000 } });

test.beforeEach(async ({ page }) => {
  await page.goto('./#/controlled');
  await page.waitForFunction(() => '__diagram' in window);
});

const move = (page: import('@playwright/test').Page, x: number) =>
  page.evaluate(
    (x) =>
      (window as unknown as Win).__diagram.update((tx) =>
        tx.updateNode('P1', { position: { x, y: 24 } }),
      ),
    x,
  );

test('edits flow into the store: JSON, dirty flag, Save', async ({ page }) => {
  const json = page.getByTestId('json');
  const dirty = page.getByTestId('dirty');
  await expect(dirty).toHaveAttribute('data-dirty', 'false');
  await move(page, 220);
  await expect(json).toContainText('"x": 220');
  await expect(dirty).toHaveAttribute('data-dirty', 'true');
  await page.getByTestId('save').click();
  await expect(dirty).toHaveAttribute('data-dirty', 'false');
  await expect(dirty).toContainText('Saved at');
  // Moving back to the saved position is a change from the saved document again.
  await move(page, 200);
  await expect(dirty).toHaveAttribute('data-dirty', 'true');
});

test('an edit from outside is patched in without resetting the viewport or selection', async ({
  page,
}) => {
  await page.evaluate(() => {
    const dg = (window as unknown as Win).__diagram;
    dg.setViewport({ x: 37, y: 41, zoom: 1.7 });
    dg.setSelection([{ kind: 'node', id: 'P1' }]);
  });
  const load = await page.evaluate(() => {
    const dg = (window as unknown as Win).__diagram as Diagram & { __loads?: number };
    const orig = dg.load.bind(dg);
    dg.__loads = 0;
    dg.load = (m) => {
      dg.__loads!++;
      orig(m);
    };
    return 0;
  });
  expect(load).toBe(0);
  await page.getByRole('button', { name: 'Rename from outside' }).click();
  await expect(page.locator('[data-node-id="P1"] .pv-label')).toHaveText('P-101 (spare)');
  const state = await page.evaluate(() => {
    const dg = (window as unknown as Win).__diagram as Diagram & { __loads?: number };
    return { vp: dg.getViewport(), sel: dg.getSelection(), loads: dg.__loads };
  });
  expect(state).toEqual({
    vp: { x: 37, y: 41, zoom: 1.7 },
    sel: [{ kind: 'node', id: 'P1' }],
    loads: 0,
  });
  await expect(page.getByTestId('selection')).toHaveText('P1');
});

test('undo history lives in the store', async ({ page }) => {
  const history = page.getByTestId('history');
  await expect(history).toHaveText('0 undo · 0 redo');
  await move(page, 240);
  await move(page, 260);
  await expect(history).toHaveText('2 undo · 0 redo');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(history).toHaveText('1 undo · 1 redo');
  await expect(page.getByTestId('json')).toContainText('"x": 240');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByTestId('json')).toContainText('"x": 260');
  // Edits from outside aren't the user's to undo.
  await page.getByRole('button', { name: 'Add from outside' }).click();
  await expect(page.locator('[data-node-id="PI1"]')).toHaveCount(1);
  await expect(history).toHaveText('2 undo · 0 redo');
});
