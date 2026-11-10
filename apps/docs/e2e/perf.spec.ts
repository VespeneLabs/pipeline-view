import { expect, test } from '@playwright/test';

/**
 * NFR-1: 500 nodes, 1,000 links and 2,000 values updating at 1 Hz. A data tick takes ≤ 4 ms of main-thread
 * time, a re-route during a drag takes ≤ 16 ms, and pan/zoom runs at ≥ 55 fps. It measures on perf.html,
 * which uses the plain core API. The numbers are attached to the test report and printed.
 */

interface PerfApi {
  tick(): number;
  drag(steps?: number): number[];
  panZoom(ms?: number): Promise<number[]>;
  loadMs: number;
  counts: { nodes: number; links: number; annotations: number; valuesPerTick: number };
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

test('NFR-1: data tick, drag re-route and pan/zoom at 500 nodes / 1k links / 2k values', async ({
  page,
}, info) => {
  test.slow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./perf.html');
  await page.waitForFunction(() => 'pv' in window || '__pv' in window);

  const counts = await page.evaluate(() => (window as unknown as { __pv: PerfApi }).__pv.counts);
  expect(counts).toEqual({ nodes: 500, links: 1000, annotations: 100, valuesPerTick: 2000 });

  const result = await page.evaluate(async () => {
    const pv = (window as unknown as { __pv: PerfApi }).__pv;
    for (let i = 0; i < 10; i++) pv.tick(); // warm-up (JIT)
    const ticks = Array.from({ length: 60 }, () => pv.tick());
    pv.drag(5); // warm-up
    const drag = pv.drag(30);
    await pv.panZoom(300); // warm-up: let GC from the tick/drag runs settle
    const frames = await pv.panZoom(2000);
    return { loadMs: pv.loadMs, ticks, drag, frames };
  });

  const avgFrame = result.frames.reduce((a, b) => a + b, 0) / result.frames.length;
  const numbers = {
    loadMs: r2(result.loadMs),
    tickMedianMs: r2(pct(result.ticks, 50)),
    tickP95Ms: r2(pct(result.ticks, 95)),
    dragMedianMs: r2(pct(result.drag, 50)),
    dragP95Ms: r2(pct(result.drag, 95)),
    panZoomFps: r2(1000 / avgFrame),
    panZoomP95FrameMs: r2(pct(result.frames, 95)),
  };
  console.log('NFR-1', JSON.stringify(numbers));
  info.annotations.push({ type: 'NFR-1', description: JSON.stringify(numbers) });

  expect(numbers.tickMedianMs, 'data tick median (≤ 4 ms)').toBeLessThanOrEqual(4);
  expect(numbers.tickP95Ms, 'data tick p95 (headroom for CI noise)').toBeLessThanOrEqual(8);
  expect(numbers.dragMedianMs, 'drag re-route median (≤ 16 ms)').toBeLessThanOrEqual(16);
  expect(numbers.panZoomFps, 'pan/zoom fps (≥ 55)').toBeGreaterThanOrEqual(55);
});
