import type { Diagram } from '@pipeline-view/core';
import { expect, test, type Page } from '@playwright/test';

/** Round-2 editor rules on #/editor: per-node ports, refusals, locks, delete confirmation, host palette. */

type Win = { __diagram: Diagram };
test.use({ viewport: { width: 1600, height: 1200 } });

const json = (page: Page) => page.evaluate(() => (window as unknown as Win).__diagram.toJSON());
const select = (page: Page, id: string) =>
  page.evaluate(
    (id) => (window as unknown as Win).__diagram.setSelection([{ kind: 'node', id }]),
    id,
  );
const center = async (page: Page, sel: string) => {
  const b = (await page.locator(sel).first().boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

test.beforeEach(async ({ page }) => {
  await page.goto('./#/editor');
  await page.waitForFunction(() => '__diagram' in window);
});

test('manifold ports follow the inspector; removing a port removes its line in one undo step', async ({
  page,
}) => {
  await select(page, 'M1');
  await expect(page.getByTestId('inputs-count')).toHaveText('3');
  await expect(page.locator('[data-node-id="M1"] .pv-port')).toHaveCount(5);
  await page.getByTestId('inputs-minus').click();
  await expect(page.locator('[data-node-id="M1"] .pv-port')).toHaveCount(4);
  expect((await json(page)).links.some((l) => l.id === 'l2')).toBe(false);
  await page.getByTestId('undo').click();
  expect((await json(page)).links.some((l) => l.id === 'l2')).toBe(true);
  await expect(page.locator('[data-node-id="M1"] .pv-port')).toHaveCount(5);
});

test('a locked line refuses the port removal and explains it', async ({ page }) => {
  await select(page, 'M1');
  await page.getByTestId('outputs-minus').click();
  await expect(page.getByTestId('toasts')).toContainText('link "l3" is locked');
  await expect(page.getByTestId('outputs-count')).toHaveText('2');
  // The locked tank doesn't move either.
  const t9 = await center(page, '[data-node-id="T9"] .pv-symbol');
  await page.mouse.move(t9.x, t9.y);
  await page.mouse.down();
  await page.mouse.move(t9.x + 80, t9.y + 40, { steps: 5 });
  await page.mouse.up();
  expect((await json(page)).nodes.find((n) => n.id === 'T9')!.position).toEqual({ x: 520, y: 330 });
});

test('directed lines: an inlet-to-inlet drag is marked while dragging and refused with a reason', async ({
  page,
}) => {
  await page.getByTestId('rule-directed').check();
  const a = await center(page, '[data-node-id="M1"] .pv-port[data-port-id="in-1"]');
  const b = await center(page, '[data-node-id="M1"] .pv-port[data-port-id="in-2"]');
  const before = (await json(page)).links.length;
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 5, a.y + 10, { steps: 3 });
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await expect(page.locator('[data-node-id="M1"] .pv-port[data-port-id="in-2"]')).toHaveAttribute(
    'data-refused',
    'direction',
  );
  await page.mouse.up();
  await expect(page.getByTestId('toasts')).toContainText('outlet to an inlet');
  expect((await json(page)).links).toHaveLength(before);
});

test('a rule change re-creates the diagram with the current document', async ({ page }) => {
  await select(page, 'M1');
  await page.getByTestId('inputs-plus').click();
  await page.getByTestId('rule-noCycles').check();
  await page.waitForFunction(() => '__diagram' in window);
  await expect
    .poll(async () => (await json(page)).nodes.find((n) => n.id === 'M1')!.data)
    .toEqual({ inputs: 4, outputs: 2 });
});

test('Confirm deletes asks with the app dialog; Cancel keeps, Delete removes', async ({ page }) => {
  await page.getByTestId('rule-confirmDeletes').check();
  await select(page, 'P1');
  await page.locator('[data-testid="editor-canvas"]').focus();
  await page.keyboard.press('Delete');
  const dialog = page.getByTestId('confirm-dialog');
  await expect(dialog).toContainText('Delete 1 node?');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  expect((await json(page)).nodes.some((n) => n.id === 'P1')).toBe(true);
  await page.locator('[data-testid="editor-canvas"]').focus();
  await page.keyboard.press('Delete');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect.poll(async () => (await json(page)).nodes.some((n) => n.id === 'P1')).toBe(false);
});

test('your own palette: HTML5 drag (acceptDrop) and Place… (startPlacement)', async ({ page }) => {
  const count = async () => (await json(page)).nodes.length;
  const before = await count();
  await page
    .getByTestId('host-process/control-valve')
    .dragTo(page.locator('[data-testid="editor-canvas"]'), { targetPosition: { x: 600, y: 140 } });
  await expect.poll(count).toBe(before + 1);
  expect((await json(page)).nodes.at(-1)!.label).toBe('Control valve 1');

  await page.getByTestId('place-process/pump').click();
  await expect(page.locator('.pv-placement')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.pv-placement')).toHaveCount(0);
  await page.getByTestId('place-process/pump').click();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect.poll(count).toBe(before + 2);
});

test('connect from the keyboard: C, pick a port, Enter, pick a target, Enter', async ({ page }) => {
  const before = (await json(page)).links.length;
  await select(page, 'P1');
  const canvas = page.locator('[data-testid="editor-canvas"]');
  await canvas.focus();
  const live = canvas.locator('.pv-live');
  await page.keyboard.press('c');
  await expect(live).toContainText('Connect from P1');
  // P1's ports are suction, discharge: step to discharge (the free one).
  await page.keyboard.press('ArrowRight');
  await expect(live).toContainText('discharge');
  await page.keyboard.press('Enter');
  await expect(live).toContainText('compatible ports');
  await page.keyboard.press('Enter');
  await expect(live).toContainText('Connected');
  const after = await json(page);
  expect(after.links).toHaveLength(before + 1);
  expect(after.links.at(-1)!.from).toEqual({ node: 'P1', port: 'discharge' });
});
