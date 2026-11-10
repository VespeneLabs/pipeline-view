import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Crossing, Junction } from './types';
import { RouteAnalyzer, analyzeRoutes } from './analyze';
import { createRouter } from './router';
import { generateScene, requestsFor } from './test-scene';

const norm = (r: { crossings: Crossing[]; junctions: Junction[] }) => ({
  crossings: r.crossings.map((c) => `${c.linkId}@${c.point.x},${c.point.y}`).sort(),
  junctions: r.junctions.map((j) => `${j.point.x},${j.point.y}:${j.linkIds.join('+')}`).sort(),
});

describe('RouteAnalyzer (incremental)', () => {
  it('matches a full analysis after arbitrary drags, additions and removals', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1e6 }),
        fc.array(
          fc.record({
            node: fc.nat(39),
            dx: fc.integer({ min: -120, max: 120 }),
            dy: fc.integer({ min: -120, max: 120 }),
            drop: fc.boolean(),
          }),
          { minLength: 1, maxLength: 6 },
        ),
        (seed, moves) => {
          const { nodes, links } = generateScene(40, 70, seed);
          const live = new Map(nodes);
          const linkSet = new Map(links.map((l) => [l.id, l]));
          const router = createRouter();
          router.setObstacles(live);
          const routes = new Map(
            router.route(requestsFor(live, links)).map((r) => [r.linkId, r.points]),
          );
          const analyzer = new RouteAnalyzer().update(routes);
          for (const m of moves) {
            const id = `n${m.node}`;
            const r = live.get(id)!;
            const rect = { ...r, x: r.x + m.dx, y: r.y + m.dy };
            live.set(id, rect);
            const affected = router.updateObstacle(id, rect).filter((l) => linkSet.has(l));
            const changes: [
              string,
              typeof rect extends never ? never : { x: number; y: number }[] | null,
            ][] = [];
            // Optionally delete one attached link to exercise removals.
            if (m.drop && affected.length) {
              const gone = affected.pop()!;
              linkSet.delete(gone);
              routes.delete(gone);
              router.removeRoutes([gone]);
              changes.push([gone, null]);
            }
            for (const res of router.route(
              requestsFor(
                live,
                affected.map((l) => linkSet.get(l)!),
              ),
            )) {
              routes.set(res.linkId, res.points);
              changes.push([res.linkId, res.points]);
            }
            analyzer.update(changes);
            const full = analyzeRoutes([...routes].map(([linkId, points]) => ({ linkId, points })));
            expect(norm(analyzer.result())).toEqual(norm(full));
          }
        },
      ),
      { numRuns: 60 },
    );
  });
});
