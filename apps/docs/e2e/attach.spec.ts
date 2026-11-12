/**
 * Link ends attached to another link, with a real mouse and keyboard on the #/editor page: select the
 * link by clicking it, then move its attached end with the arrow keys and by dragging the handle.
 */
import { type Page, expect, test } from '@playwright/test';

test.use({ viewport: { width: 1600, height: 1200 } });

interface Pt {
  x: number;
  y: number;
}
interface D {
  update(fn: (tx: { addLink(l: unknown): void }) => void): void;
  setSelection(s: unknown[]): void;
  getSelection(): { kind: string; id: string }[];
  getLinkPath(id: string): Pt[];
  diagramToScreen(p: Pt): Pt;
  toJSON(): { links: { id: string; toAttach?: { link: string; at: number } }[] };
  view: { root: Element };
}
const at = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __diagram: D }).__diagram.toJSON().links.find((l) => l.id === 'side')!
        .toAttach!.at,
  );

/** Client coordinates of the middle of the longest segment of a link. */
const onLink = (page: Page, id: string) =>
  page.evaluate((linkId) => {
    const d = (window as unknown as { __diagram: D }).__diagram;
    const pts = d.getLinkPath(linkId);
    let best = { len: -1, x: 0, y: 0 };
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const len = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      if (len > best.len) best = { len, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
    const s = d.diagramToScreen(best);
    const r = d.view.root.getBoundingClientRect();
    return { x: r.left + s.x, y: r.top + s.y };
  }, id);

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./#/editor');
  await expect(page.getByTestId('editor-canvas').locator('.pv-node').first()).toBeVisible();
  await page.waitForFunction(() => '__diagram' in window);
  // A line from pump P1 that joins the XV1 -> T1 pipe halfway.
  await page.evaluate(() => {
    const d = (window as unknown as { __diagram: D }).__diagram;
    d.update((tx) =>
      tx.addLink({
        id: 'side',
        kind: 'process',
        from: { node: 'P1', port: 'discharge' },
        to: { node: 'T1', port: 'in' },
        toAttach: { link: 'l1', at: 0.5 },
      }),
    );
    d.setSelection([]);
  });
  await expect(page.locator('.pv-link[data-link-id="side"][data-attached]')).toBeVisible();
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

test('click the link, then the arrow keys move its attached end', async ({ page }) => {
  const p = await onLink(page, 'side');
  await page.mouse.click(p.x, p.y);
  expect(
    await page.evaluate(() => (window as unknown as { __diagram: D }).__diagram.getSelection()),
  ).toEqual([{ kind: 'link', id: 'side' }]);
  await expect(page.locator('.pv-attach-handle')).toBeVisible();
  // The canvas has keyboard focus after the click, and the selection survived it.
  expect(
    await page.evaluate(() => {
      const d = (window as unknown as { __diagram: D }).__diagram;
      return document.activeElement === d.view.root;
    }),
  ).toBe(true);
  const before = await at(page);
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  const after = await at(page);
  expect(after).toBeGreaterThan(before);
  await page.keyboard.press('Shift+ArrowLeft');
  expect(await at(page)).toBeLessThan(after);
});

test('click the link, then drag the handle along the host link', async ({ page }) => {
  const p = await onLink(page, 'side');
  await page.mouse.click(p.x, p.y);
  const handle = page.locator('.pv-attach-handle');
  await expect(handle).toBeVisible();
  const b = (await handle.boundingBox())!;
  const from = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const before = await at(page);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x - 10, from.y + 6, { steps: 4 });
  await page.mouse.move(from.x - 40, from.y + 10, { steps: 8 });
  await page.mouse.up();
  expect(await at(page)).toBeLessThan(before);
  // Still selected, handle still there, and one undo puts it back.
  await expect(page.locator('.pv-attach-handle')).toBeVisible();
  await page.keyboard.press('Control+z');
  expect(await at(page)).toBe(before);
});
