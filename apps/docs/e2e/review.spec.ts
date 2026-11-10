import type { Diagram } from '@pipeline-view/core';
import { expect, test } from '@playwright/test';

type Win = { __diagram: Diagram };

test.use({ viewport: { width: 1600, height: 1000 } });

for (const theme of ['light', 'dark'] as const) {
  test(`validation & compare reference state (${theme})`, async ({ page }) => {
    await page.goto(`./?static&theme=${theme}#/review`);
    const canvas = page.getByTestId('review-canvas');
    await expect(canvas.locator('.pv-issue-badge')).toHaveCount(3);
    await expect(canvas.locator('.pv-diff-ghost')).toHaveCount(1);
    await page.evaluate(() => document.fonts.ready);
    await expect(canvas).toHaveScreenshot(`review-${theme}.png`);
  });
}

test('Validate marks items, lists them, and F8 steps through them', async ({ page }) => {
  await page.goto('./#/review');
  const canvas = page.getByTestId('review-canvas');
  await expect(canvas.locator('.pv-issue-badge')).toHaveCount(0);
  await page.getByTestId('validate').click();
  await expect(canvas.locator('[data-node-id="P2"]')).toHaveAttribute(
    'data-issue-severity',
    'error',
  );
  await expect(canvas.locator('[data-node-id="P2"]')).toHaveAttribute(
    'aria-description',
    'Error: Discharge is not connected.',
  );
  await expect(canvas.locator('[data-link-id="l6"]')).toHaveAttribute(
    'data-issue-severity',
    'warning',
  );
  await expect(page.getByTestId('issue-list')).toContainText('1 error, 1 warning, 1 info');

  await canvas.locator('.pv-root').focus();
  await page.keyboard.press('F8');
  const selected = () => page.evaluate(() => (window as unknown as Win).__diagram.getSelection());
  expect(await selected()).toEqual([{ kind: 'node', id: 'T3' }]);
  await page.keyboard.press('F8');
  expect(await selected()).toEqual([{ kind: 'link', id: 'l6' }]);

  // Fixing the problem through an edit clears its marker.
  await page.evaluate(() =>
    (window as unknown as Win).__diagram.update((tx) =>
      tx.addLink({
        id: 'fix',
        from: { node: 'P2', port: 'discharge' },
        to: { node: 'T3', port: 'bottom' },
        kind: 'process',
      }),
    ),
  );
  await expect(canvas.locator('[data-node-id="P2"]')).not.toHaveAttribute('data-issue-severity');
});

test('Compare marks changes, lists them, follows edits, and Save clears them', async ({ page }) => {
  await page.goto('./#/review');
  const canvas = page.getByTestId('review-canvas');
  const list = page.getByTestId('change-list');
  await page.getByTestId('compare').click();
  await expect(canvas.locator('[data-node-id="P1"]')).toHaveAttribute('data-diff', 'moved');
  await expect(canvas.locator('[data-node-id="V1"]')).toHaveAttribute('data-diff', 'changed');
  await expect(canvas.locator('[data-node-id="P2"]')).toHaveAttribute('data-diff', 'added');
  await expect(canvas.locator('.pv-diff-ghost[data-diff-node="XV1"]')).toHaveCount(1);
  await expect(list.locator('.chip[data-mark="removed"]')).toHaveCount(2);

  // Clicking a change selects that item.
  await list.getByRole('button', { name: /FCV-101A/ }).click();
  expect(await page.evaluate(() => (window as unknown as Win).__diagram.getSelection())).toEqual([
    { kind: 'node', id: 'V1' },
  ]);

  // Moving P-101 back to where it was saved removes its "moved" mark.
  await page.evaluate(() =>
    (window as unknown as Win).__diagram.update((tx) =>
      tx.updateNode('P1', { position: { x: 200, y: 64 } }),
    ),
  );
  await expect(canvas.locator('[data-node-id="P1"]')).not.toHaveAttribute('data-diff');

  await page.getByRole('button', { name: 'Save this version' }).click();
  await expect(list).toContainText('No changes.');
  await expect(canvas.locator('[data-diff]')).toHaveCount(0);
});
