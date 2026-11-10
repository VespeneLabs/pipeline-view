import { describe, expect, it } from 'vitest';
import type { Point, Rect } from '../model/types';
import { inflate, segmentHitsBox } from './geometry';
import { createRouter } from './router';
import { endpoint } from './test-scene';
import type { RouteRequest } from './types';

const rect = (x: number, y: number, width = 40, height = 40): Rect => ({ x, y, width, height });

function isOrthogonal(pts: Point[]): boolean {
  return pts.every((p, i) => i === 0 || p.x === pts[i - 1]!.x || p.y === pts[i - 1]!.y);
}

function bends(pts: Point[]): number {
  return Math.max(0, pts.length - 2);
}

describe('OrthogonalRouter', () => {
  it('routes a straight pipe between aligned ports', () => {
    const nodes = new Map([
      ['a', rect(0, 0)],
      ['b', rect(200, 0)],
    ]);
    const router = createRouter();
    router.setObstacles(nodes);
    const [res] = router.route([
      { linkId: 'l', from: endpoint(nodes, 'a', 'right'), to: endpoint(nodes, 'b', 'left') },
    ]);
    expect(res!.points).toEqual([
      { x: 40, y: 20 },
      { x: 200, y: 20 },
    ]);
  });

  it('avoids nodes in the way', () => {
    const nodes = new Map([
      ['a', rect(0, 0)],
      ['block', rect(100, -40, 40, 120)],
      ['b', rect(240, 0)],
    ]);
    const router = createRouter({ clearance: 10 });
    router.setObstacles(nodes);
    const [res] = router.route([
      { linkId: 'l', from: endpoint(nodes, 'a', 'right'), to: endpoint(nodes, 'b', 'left') },
    ]);
    const pts = res!.points;
    expect(isOrthogonal(pts)).toBe(true);
    const box = inflate(nodes.get('block')!, 10 - 1e-3);
    for (let i = 0; i + 1 < pts.length; i++) {
      expect(segmentHitsBox(pts[i]!, pts[i + 1]!, box)).toBe(false);
    }
    expect(bends(pts)).toBe(4);
  });

  it('respects port directions for the first and last segment', () => {
    const nodes = new Map([
      ['a', rect(0, 0)],
      ['b', rect(200, 200)],
    ]);
    const router = createRouter();
    router.setObstacles(nodes);
    const [res] = router.route([
      { linkId: 'l', from: endpoint(nodes, 'a', 'bottom'), to: endpoint(nodes, 'b', 'top') },
    ]);
    const pts = res!.points;
    expect(pts[0]).toEqual({ x: 20, y: 40 });
    expect(pts[1]!.x).toBe(20);
    expect(pts[1]!.y).toBeGreaterThan(40);
    const last = pts[pts.length - 1]!;
    const prev = pts[pts.length - 2]!;
    expect(last).toEqual({ x: 220, y: 200 });
    expect(prev.x).toBe(220);
    expect(prev.y).toBeLessThan(200);
    expect(bends(pts)).toBe(2);
  });

  it('leaves a port pointing away from the target and comes back around', () => {
    const nodes = new Map([
      ['a', rect(0, 0)],
      ['b', rect(200, 0)],
    ]);
    const router = createRouter({ clearance: 12 });
    router.setObstacles(nodes);
    const [res] = router.route([
      { linkId: 'l', from: endpoint(nodes, 'a', 'left'), to: endpoint(nodes, 'b', 'left') },
    ]);
    const pts = res!.points;
    expect(isOrthogonal(pts)).toBe(true);
    expect(pts[1]!.x).toBeLessThan(0);
    expect(pts[1]!.y).toBe(20);
    const a = inflate(nodes.get('a')!, 12 - 1e-3);
    for (let i = 1; i + 2 < pts.length; i++) {
      expect(segmentHitsBox(pts[i]!, pts[i + 1]!, a)).toBe(false);
    }
  });

  it('passes through manual waypoints in order', () => {
    const nodes = new Map([
      ['a', rect(0, 0)],
      ['b', rect(300, 0)],
    ]);
    const router = createRouter();
    router.setObstacles(nodes);
    const waypoints = [
      { x: 120, y: 150 },
      { x: 200, y: -100 },
    ];
    const [res] = router.route([
      {
        linkId: 'l',
        from: endpoint(nodes, 'a', 'right'),
        to: endpoint(nodes, 'b', 'left'),
        waypoints,
      },
    ]);
    const pts = res!.points;
    expect(isOrthogonal(pts)).toBe(true);
    const onPath = (w: Point): number =>
      pts.findIndex(
        (p, i) =>
          i + 1 < pts.length &&
          Math.min(p.x, pts[i + 1]!.x) <= w.x &&
          w.x <= Math.max(p.x, pts[i + 1]!.x) &&
          Math.min(p.y, pts[i + 1]!.y) <= w.y &&
          w.y <= Math.max(p.y, pts[i + 1]!.y),
      );
    const i0 = onPath(waypoints[0]!);
    const i1 = onPath(waypoints[1]!);
    expect(i0).toBeGreaterThanOrEqual(0);
    expect(i1).toBeGreaterThan(i0);
  });

  it('spreads parallel pipes that share a corridor', () => {
    const nodes = new Map([
      ['a1', rect(0, 0)],
      ['a2', rect(0, 100)],
      ['b1', rect(300, 300)],
      ['b2', rect(300, 400)],
    ]);
    const router = createRouter({ spacing: 6 });
    router.setObstacles(nodes);
    const reqs: RouteRequest[] = [
      { linkId: 'l1', from: endpoint(nodes, 'a1', 'right'), to: endpoint(nodes, 'b1', 'left') },
      { linkId: 'l2', from: endpoint(nodes, 'a2', 'right'), to: endpoint(nodes, 'b2', 'left') },
    ];
    const [r1, r2] = router.route(reqs);
    // Both go right, down, right; the vertical runs must not overlap on the same x.
    const vx = (pts: Point[]) =>
      pts.find((p, i) => i > 0 && p.x === pts[i - 1]!.x && p.y !== pts[i - 1]!.y)!.x;
    expect(Math.abs(vx(r1!.points) - vx(r2!.points))).toBeGreaterThanOrEqual(6);
  });

  it('reports links affected by a moved node', () => {
    const nodes = new Map([
      ['a', rect(0, 0)],
      ['b', rect(300, 0)],
      ['c', rect(0, 300)],
      ['d', rect(300, 300)],
      ['m', rect(600, 600)],
    ]);
    const router = createRouter();
    router.setObstacles(nodes);
    router.route([
      { linkId: 'ab', from: endpoint(nodes, 'a', 'right'), to: endpoint(nodes, 'b', 'left') },
      { linkId: 'cd', from: endpoint(nodes, 'c', 'right'), to: endpoint(nodes, 'd', 'left') },
      { linkId: 'am', from: endpoint(nodes, 'a', 'bottom'), to: endpoint(nodes, 'm', 'left') },
    ]);
    // Move 'm' onto the a-b pipe: 'am' (attached) and 'ab' (now blocked) are affected; 'cd' is not.
    const affected = router.updateObstacle('m', rect(150, 0, 40, 40));
    expect(affected.sort()).toEqual(['ab', 'am']);
    // Removing 'c' affects its own link and any route that detoured around it, but not 'ab'.
    const removed = router.updateObstacle('c', null);
    expect(removed).toContain('cd');
    expect(removed).not.toContain('ab');
  });

  it('forgets removed routes', () => {
    const nodes = new Map([
      ['a', rect(0, 0)],
      ['b', rect(300, 0)],
    ]);
    const router = createRouter();
    router.setObstacles(nodes);
    router.route([
      { linkId: 'ab', from: endpoint(nodes, 'a', 'right'), to: endpoint(nodes, 'b', 'left') },
    ]);
    router.removeRoutes(['ab']);
    expect(router.updateObstacle('a', rect(0, 10))).toEqual([]);
  });

  it('falls back to an L-shape when an endpoint is enclosed', () => {
    const nodes = new Map([
      ['a', rect(0, 0)],
      ['wall', rect(-100, -100, 400, 400)],
      ['b', rect(500, 0)],
    ]);
    const router = createRouter();
    router.setObstacles(nodes);
    const [res] = router.route([
      { linkId: 'l', from: endpoint(nodes, 'a', 'right'), to: endpoint(nodes, 'b', 'left') },
    ]);
    expect(isOrthogonal(res!.points)).toBe(true);
    expect(res!.points[0]).toEqual({ x: 40, y: 20 });
    expect(res!.points[res!.points.length - 1]).toEqual({ x: 500, y: 20 });
  });
});

describe('analyze', () => {
  const router = createRouter();

  it('finds a crossing and puts the jump on the horizontal link only', () => {
    const { crossings, junctions } = router.analyze([
      {
        linkId: 'h',
        points: [
          { x: 0, y: 50 },
          { x: 100, y: 50 },
        ],
      },
      {
        linkId: 'v',
        points: [
          { x: 50, y: 0 },
          { x: 50, y: 100 },
        ],
      },
    ]);
    expect(crossings).toEqual([
      { linkId: 'h', point: { x: 50, y: 50 }, orientation: 'horizontal' },
    ]);
    expect(junctions).toEqual([]);
  });

  it('finds a branch junction where a link leaves a shared trunk', () => {
    const { crossings, junctions } = router.analyze([
      {
        linkId: 'a',
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
      },
      {
        linkId: 'b',
        points: [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
          { x: 50, y: 80 },
        ],
      },
    ]);
    expect(junctions).toEqual([{ point: { x: 50, y: 0 }, linkIds: ['a', 'b'] }]);
    expect(crossings).toEqual([]);
  });

  it('finds a T junction where a link ends on another link', () => {
    const { junctions } = router.analyze([
      {
        linkId: 'main',
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
      },
      {
        linkId: 'tee',
        points: [
          { x: 40, y: 60 },
          { x: 40, y: 0 },
        ],
      },
    ]);
    expect(junctions).toEqual([{ point: { x: 40, y: 0 }, linkIds: ['main', 'tee'] }]);
  });

  it('does not report touching corners or shared ports as junctions', () => {
    const { crossings, junctions } = router.analyze([
      {
        linkId: 'a',
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
      },
      {
        linkId: 'b',
        points: [
          { x: 0, y: 0 },
          { x: 0, y: 100 },
        ],
      },
    ]);
    expect(junctions).toEqual([]);
    expect(crossings).toEqual([]);
  });
});
