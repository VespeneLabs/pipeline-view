import { expect, test } from '@playwright/test';

interface StressHook {
  nodes: number;
  links: number;
  tick: () => number;
}

test('stress page renders 500 nodes / 1,000 links and ticks 2,000 values', async ({ page }) => {
  await page.goto('./#/stress');
  await page.waitForFunction(() => (window as unknown as { __stress?: unknown }).__stress);
  await expect(page.locator('.pv-node')).toHaveCount(500);
  await expect(page.locator('.pv-link')).toHaveCount(1000);
  const { nodes, links, worst } = await page.evaluate(() => {
    const s = (window as unknown as { __stress: StressHook }).__stress;
    const times = Array.from({ length: 10 }, () => s.tick());
    return { nodes: s.nodes, links: s.links, worst: Math.max(...times) };
  });
  expect(nodes).toBe(500);
  expect(links).toBe(1000);
  // NFR-1 is 4 ms on a mid-range laptop; shared CI runners get a loose ceiling. Real numbers come from
  // running the page in a production build.
  expect(worst).toBeLessThan(40);
  await expect(page.getByTestId('stress-ticks')).not.toHaveText('0', { timeout: 5000 });
});
