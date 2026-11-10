import { expect, test } from '@playwright/test';

// Smoke test for the editor page. The full editor flows (connect, rotate, undo/redo, save/load) live in
// editor.spec.ts, written by the editor owner against the test ids below.
test('editor page mounts the fixed start model, palette and JSON tools', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./#/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  for (const id of ['P1', 'XV1', 'T1', 'PT1']) {
    await expect(page.locator(`[data-node-id="${id}"]`)).toHaveCount(1);
  }
  await expect(
    page.getByTestId('palette').getByTestId('palette-item-gas/gate-valve'),
  ).toBeVisible();
  await page.getByTestId('save-json').click();
  await expect(page.getByTestId('json-textarea')).toHaveValue(/"id": "XV1"/);
  await expect(page.getByTestId('undo')).toBeDisabled();
  expect(errors).toEqual([]);
});
