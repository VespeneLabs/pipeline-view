import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Point, Rect } from '../model/types';
import type { PortDirection } from '../symbols/types';
import { inflate, segmentHitsBox } from './geometry';
import { createRouter } from './router';
import { SIDES, portOf, requestsFor, type SceneLink } from './test-scene';

const CLEARANCE = 10;

/** Nodes placed in distinct cells of a 6x6 grid, so they never overlap or sit within 2 x clearance. */
const sceneArb = fc
  .uniqueArray(fc.integer({ min: 0, max: 35 }), { minLength: 2, maxLength: 14 })
  .chain((cells) =>
    fc.record({
      nodes: fc.tuple(
        ...cells.map((cell) =>
          fc
            .record({
              w: fc.integer({ min: 10, max: 90 }),
              h: fc.integer({ min: 10, max: 90 }),
              dx: fc.integer({ min: 0, max: 30 }),
              dy: fc.integer({ min: 0, max: 30 }),
            })
            .map(({ w, h, dx, dy }) => ({
              id: `n${cell}`,
              rect: {
                x: (cell % 6) * 160 + dx,
                y: Math.floor(cell / 6) * 160 + dy,
                width: w,
                height: h,
              },
            })),
        ),
      ),
      links: fc.array(
        fc.record({
          a: fc.nat(),
          b: fc.nat(),
          sa: fc.constantFrom(...SIDES),
          sb: fc.constantFrom(...SIDES),
          waypoint: fc.option(
            fc.record({
              x: fc.integer({ min: -40, max: 980 }),
              y: fc.integer({ min: -40, max: 980 }),
            }),
            {
              freq: 5,
            },
          ),
        }),
        { minLength: 1, maxLength: 20 },
      ),
    }),
  );

function insideAny(p: Point, nodes: Map<string, Rect>): boolean {
  for (const r of nodes.values()) {
    if (segmentHitsBox(p, p, inflate(r, CLEARANCE - 1e-3))) return true;
  }
  return false;
}

describe('router properties', () => {
  it('auto-routed segments never enter a non-endpoint obstacle (with clearance)', () => {
    fc.assert(
      fc.property(sceneArb, ({ nodes: list, links: raw }) => {
        const nodes = new Map(list.map((n) => [n.id, n.rect]));
        const ids = list.map((n) => n.id);
        const links: (SceneLink & { waypoint: Point | null })[] = raw.map((l, i) => ({
          id: `l${i}`,
          from: { node: ids[l.a % ids.length]!, side: l.sa as PortDirection },
          to: { node: ids[l.b % ids.length]!, side: l.sb as PortDirection },
          waypoint: l.waypoint,
        }));
        const router = createRouter({ clearance: CLEARANCE });
        router.setObstacles(nodes);
        const reqs = requestsFor(nodes, links).map((r, i) => {
          const w = links[i]!.waypoint;
          // Waypoints inside an obstacle cannot be honoured without entering it; skip those.
          return w && !insideAny(w, nodes) ? { ...r, waypoints: [w] } : r;
        });
        const results = router.route(reqs);

        results.forEach((res, i) => {
          const link = links[i]!;
          const pts = res.points;
          expect(pts[0]).toEqual(portOf(nodes.get(link.from.node)!, link.from.side));
          expect(pts[pts.length - 1]).toEqual(portOf(nodes.get(link.to.node)!, link.to.side));
          for (let k = 0; k + 1 < pts.length; k++) {
            const a = pts[k]!;
            const b = pts[k + 1]!;
            expect(a.x === b.x || a.y === b.y).toBe(true);
            for (const [id, rect] of nodes) {
              // Port segments start inside their own node's clearance; everything else stays clear.
              const ownStub =
                (k === 0 && id === link.from.node) || (k === pts.length - 2 && id === link.to.node);
              if (ownStub) continue;
              const endpointNode = id === link.from.node || id === link.to.node;
              const box = inflate(rect, (endpointNode ? 0 : CLEARANCE) - 1e-3);
              if (segmentHitsBox(a, b, box)) {
                throw new Error(`${res.linkId} segment ${k} enters ${id}: ${JSON.stringify(pts)}`);
              }
            }
          }
        });
      }),
      { numRuns: 300 },
    );
  });
});
