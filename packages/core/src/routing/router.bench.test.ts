import { describe, expect, it } from 'vitest';
import { createRouter } from './router';
import { generateScene, requestsFor } from './test-scene';

/** NFR-1: re-routing the links touched by a dragged node takes <= 16 ms. */
const DRAG_BUDGET_MS = 16;

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

describe('router benchmark (500 nodes / 1,000 links)', () => {
  const { nodes, links } = generateScene(500, 1000, 7);

  it('routes the full diagram', () => {
    const router = createRouter();
    router.setObstacles(nodes);
    const reqs = requestsFor(nodes, links);
    const t0 = performance.now();
    const results = router.route(reqs);
    const full = performance.now() - t0;
    const t1 = performance.now();
    router.analyze(results);
    const analyze = performance.now() - t1;
    console.info(`full route: ${full.toFixed(1)} ms, analyze: ${analyze.toFixed(1)} ms`);
    expect(results).toHaveLength(1000);
    // Generous ceiling for slow CI machines; the interactive budget is the drag test below.
    expect(full).toBeLessThan(5000);
  });

  it(`re-routes links touched by one dragged node within ${DRAG_BUDGET_MS} ms`, () => {
    const router = createRouter();
    router.setObstacles(nodes);
    router.route(requestsFor(nodes, links));

    // Drag the busiest node along a path of small steps, like pointermove events.
    const degree = new Map<string, number>();
    for (const l of links) {
      degree.set(l.from.node, (degree.get(l.from.node) ?? 0) + 1);
      degree.set(l.to.node, (degree.get(l.to.node) ?? 0) + 1);
    }
    const [dragged] = [...degree.entries()].sort((a, b) => b[1] - a[1])[0]!;
    const start = nodes.get(dragged)!;
    const live = new Map(nodes);
    const byId = new Map(links.map((l) => [l.id, l]));
    const times: number[] = [];
    let touched = 0;
    for (let step = 1; step <= 40; step++) {
      const rect = { ...start, x: start.x + step * 7, y: start.y + step * 4 };
      live.set(dragged, rect);
      const t0 = performance.now();
      const affected = router.updateObstacle(dragged, rect);
      router.route(
        requestsFor(
          live,
          affected.map((id) => byId.get(id)!),
        ),
      );
      times.push(performance.now() - t0);
      touched = Math.max(touched, affected.length);
    }
    const med = median(times);
    const max = Math.max(...times);
    console.info(
      `drag re-route (${dragged}, degree ${degree.get(dragged)}, up to ${touched} links): median ${med.toFixed(2)} ms, max ${max.toFixed(2)} ms`,
    );
    expect(med).toBeLessThanOrEqual(DRAG_BUDGET_MS);
  });
});
