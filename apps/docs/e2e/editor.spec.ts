/**
 * Editor e2e (PRD Demo 2, NFR-6): connect, rotate, undo/redo and JSON save/load on the #/editor page.
 * The page starts from a fixed model and exposes the core Diagram as `window.__diagram`.
 */
import { type Locator, type Page, expect, test } from '@playwright/test';

// The page has a "What to try" panel and side panels above / beside the canvas: a desktop-sized
// viewport keeps the pointer gestures on screen.
test.use({ viewport: { width: 1600, height: 1200 } });

interface Snapshot {
  nodes: { id: string; type: string; rotation?: number; position: { x: number; y: number } }[];
  links: {
    id: string;
    from: { node: string; port: string };
    to: { node: string; port: string };
    kind: string;
  }[];
}

const model = (page: Page): Promise<Snapshot> =>
  page.evaluate(() =>
    (window as unknown as { __diagram: { toJSON(): Snapshot } }).__diagram.toJSON(),
  );

const node = (page: Page, id: string) =>
  page.getByTestId('editor-canvas').locator(`.pv-node[data-node-id="${id}"]`);

const port = (page: Page, nodeId: string, portId: string) =>
  node(page, nodeId).locator(`.pv-port[data-port-id="${portId}"]`);

async function center(loc: Locator): Promise<{ x: number; y: number }> {
  const b = (await loc.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** A real mouse drag in small steps, so the editor sees pointermove past its drag threshold. */
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + (to.x - from.x) / 4, from.y + (to.y - from.y) / 4, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./#/editor');
  await expect(page.getByTestId('editor-canvas').locator('.pv-node').first()).toBeVisible();
  await page.waitForFunction(() => '__diagram' in window);
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

test('connects two ports by dragging, with compatible ports highlighted', async ({ page }) => {
  const before = (await model(page)).links.length;
  const from = await center(port(page, 'P1', 'discharge'));
  const to = await center(port(page, 'XV1', 'in'));

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 20, from.y + 10, { steps: 4 });
  await expect(page.locator('.pv-editor .pv-port-target').first()).toBeVisible();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await expect(page.locator('.pv-editor .pv-port-target.pv-hot')).toHaveCount(1);
  await page.mouse.up();

  const after = await model(page);
  expect(after.links).toHaveLength(before + 1);
  expect(after.links.at(-1)).toMatchObject({
    from: { node: 'P1', port: 'discharge' },
    to: { node: 'XV1', port: 'in' },
  });
  await expect(page.locator(`.pv-link[data-link-id="${after.links.at(-1)!.id}"]`)).toHaveCount(1);
});

test('rotates the selected node with R and with the rotate handle', async ({ page }) => {
  await node(page, 'XV1').click();
  await expect(page.getByTestId('selection-info')).toContainText('XV1');
  await page.keyboard.press('r');
  expect((await model(page)).nodes.find((n) => n.id === 'XV1')!.rotation).toBe(90);

  await page.locator('.pv-editor .pv-rotate-handle').click();
  expect((await model(page)).nodes.find((n) => n.id === 'XV1')!.rotation).toBe(180);
  await expect(node(page, 'XV1').locator('.pv-node-body')).toHaveAttribute(
    'transform',
    /rotate\(180/,
  );
});

test('undo and redo with keyboard shortcuts and toolbar buttons', async ({ page }) => {
  const start = await model(page);
  const n = node(page, 'XV1');
  const c = await center(n);
  await drag(page, c, { x: c.x + 80, y: c.y + 40 });
  const moved = (await model(page)).nodes.find((x) => x.id === 'XV1')!.position;
  expect(moved).not.toEqual(start.nodes.find((x) => x.id === 'XV1')!.position);

  await page.keyboard.press('ControlOrMeta+z');
  expect(await model(page)).toEqual(start);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  expect((await model(page)).nodes.find((x) => x.id === 'XV1')!.position).toEqual(moved);

  await page.getByTestId('undo').click();
  expect(await model(page)).toEqual(start);
  await expect(page.getByTestId('undo')).toBeDisabled();
  await page.getByTestId('redo').click();
  expect((await model(page)).nodes.find((x) => x.id === 'XV1')!.position).toEqual(moved);
});

test('adds a symbol from the palette and deletes it', async ({ page }) => {
  const before = (await model(page)).nodes.length;
  await page.getByTestId('palette').getByTestId('palette-item-gas/ball-valve').click();
  const after = await model(page);
  expect(after.nodes).toHaveLength(before + 1);
  const added = after.nodes.at(-1)!;
  expect(added.type).toBe('gas/ball-valve');
  await expect(node(page, added.id)).toBeVisible();
  await page.getByTestId('editor-canvas').focus();
  await page.keyboard.press('Delete');
  expect((await model(page)).nodes).toHaveLength(before);
});

test('saves to JSON and loads an edited model back', async ({ page }) => {
  await page.getByTestId('save-json').click();
  const textarea = page.getByTestId('json-textarea');
  const saved = JSON.parse(await textarea.inputValue()) as Snapshot;
  expect(saved).toEqual(await model(page));

  // Edit the JSON: move XV1 and drop every link, then load it.
  const edited = {
    ...saved,
    nodes: saved.nodes.map((n) =>
      n.id === 'XV1' ? { ...n, position: { x: n.position.x + 100, y: n.position.y } } : n,
    ),
    links: [],
  };
  await textarea.fill(JSON.stringify(edited, null, 2));
  await page.getByTestId('load-json').click();
  expect(await model(page)).toEqual(edited);
  await expect(page.getByTestId('editor-canvas').locator('.pv-link')).toHaveCount(0);

  // A load is not an undo step.
  await expect(page.getByTestId('undo')).toBeDisabled();
});
