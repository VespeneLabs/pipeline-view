import type { Diagram } from '@pipeline-view/core';
import { expect, test, type Page } from '@playwright/test';

/** The generic instrument bubble on #/editor: palette presets, and the inspector that edits its data. */

type Win = { __diagram: Diagram };
test.use({ viewport: { width: 1600, height: 1200 } });

const json = (page: Page) => page.evaluate(() => (window as unknown as Win).__diagram.toJSON());
const node = async (page: Page, id: string) => (await json(page)).nodes.find((n) => n.id === id)!;
const bubble = (page: Page, id: string) => page.locator(`[data-node-id="${id}"] .pv-symbol`);

test.beforeEach(async ({ page }) => {
  await page.goto('./#/editor');
  await page.waitForFunction(() => '__diagram' in window);
});

test('a palette preset creates the generic instrument with its data, by click and by drag', async ({
  page,
}) => {
  const palette = page.getByTestId('palette');
  // The presets are the first group, drawn with their data.
  await expect(palette.locator('.pv-palette-group-title').first()).toContainText(
    'Instrument presets',
  );
  await expect(palette.getByTestId('palette-preset-pdt').locator('text')).toHaveText('PDT');

  await palette.getByTestId('palette-preset-pdt').click();
  expect(await node(page, 'instrument_1')).toMatchObject({
    type: 'process/instrument',
    data: { letters: 'PDT' },
  });
  await expect(bubble(page, 'instrument_1').locator('text')).toHaveText('PDT');

  await palette
    .getByTestId('palette-preset-fic')
    .dragTo(page.getByTestId('editor-canvas'), { targetPosition: { x: 620, y: 420 } });
  expect((await node(page, 'instrument_2')).data).toEqual({
    letters: 'FIC',
    location: 'panel',
    mounting: 'none',
  });
  // On its own: no tap port, and the panel line is drawn.
  await expect(page.locator('[data-node-id="instrument_2"] .pv-port')).toHaveCount(2);
  await expect(bubble(page, 'instrument_2').locator('path[d="M1 31H61"]')).toHaveCount(1);

  // A preset is one undo step, like any symbol.
  await page.getByTestId('undo').click();
  expect((await json(page)).nodes.some((n) => n.id === 'instrument_2')).toBe(false);
});

test('the inspector redraws a bubble from its fields, one undo step per change', async ({
  page,
}) => {
  await page.getByTestId('palette').getByTestId('palette-preset-pt').click();
  const fields = page.getByTestId('instrument-fields');
  await expect(fields).toBeVisible();
  await expect(page.getByTestId('inst-letters')).toHaveValue('PT');
  await expect(page.getByTestId('inst-reading')).toHaveText('Pressure transmitter');

  // Typing is read back at once and written on Enter.
  await page.getByTestId('inst-letters').fill('LSHH');
  await expect(page.getByTestId('inst-reading')).toHaveText('Level switch high-high');
  expect((await node(page, 'instrument_1')).data).toEqual({ letters: 'PT' });
  await page.getByTestId('inst-letters').press('Enter');
  await expect(bubble(page, 'instrument_1').locator('text')).toHaveText('LSHH');
  // Keys typed in a field never reach the editor: the node is still there, unrotated.
  expect((await node(page, 'instrument_1')).rotation ?? 0).toBe(0);

  await page.getByTestId('inst-loop').fill('204');
  await page.getByTestId('inst-loop').blur();
  await page.getByTestId('inst-device').selectOption('shared');
  await page.getByTestId('inst-location').selectOption('behind-panel');
  await page.getByTestId('inst-high').fill('HH');
  await page.getByTestId('inst-high').blur();
  expect((await node(page, 'instrument_1')).data).toEqual({
    letters: 'LSHH',
    loop: '204',
    device: 'shared',
    location: 'behind-panel',
    high: 'HH',
  });
  const art = bubble(page, 'instrument_1');
  await expect(art.locator('text')).toHaveText(['LSHH', '204', 'HH']);
  await expect(art.locator('path[d^="M1 1H61V61H1Z"]')).toHaveCount(1);
  await expect(art.locator('path[stroke-dasharray="5 4"]')).toHaveCount(1);

  // Mounting moves the process ports; the signal ports stay.
  await expect(page.locator('[data-node-id="instrument_1"] .pv-port')).toHaveCount(3);
  await page.getByTestId('inst-mounting').selectOption('inline');
  await expect(
    page.locator('[data-node-id="instrument_1"] .pv-port[data-port-id="out"]'),
  ).toHaveCount(1);
  await expect(page.locator('[data-node-id="instrument_1"] .pv-port')).toHaveCount(4);

  // A warning for letters that don't fit, and the field still takes them.
  await page.getByTestId('inst-letters').fill('PIQ');
  await expect(page.getByTestId('inst-reading')).toContainText('"Q" has no meaning');

  // Undo walks back one field at a time, and the fields follow.
  await page.getByTestId('inst-letters').fill('LSHH');
  await page.getByTestId('undo').click();
  expect((await node(page, 'instrument_1')).data).not.toHaveProperty('mounting');
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('inst-high')).toHaveValue('');
  // Emptying a field gives the default back.
  await page.getByTestId('inst-device').selectOption('');
  expect((await node(page, 'instrument_1')).data).not.toHaveProperty('device');
});

test('the bubbles of the packs take the same fields', async ({ page }) => {
  await page.evaluate(() =>
    (window as unknown as Win).__diagram.setSelection([{ kind: 'node', id: 'PT1' }]),
  );
  await expect(page.getByTestId('inst-loop')).toHaveValue('101');
  // Only the generic symbol can change its mounting.
  await expect(page.getByTestId('inst-mounting')).toHaveCount(0);
  await page.getByTestId('inst-location').selectOption('local-panel');
  await expect(bubble(page, 'PT1').locator('path[d="M1.2 28H60.8M1.2 34H60.8"]')).toHaveCount(1);
  expect((await node(page, 'PT1')).type).toBe('gas/pressure-transmitter');
});
