import { describe, expect, it } from 'vitest';
import type { Point, Rect } from '../model/types';
import { analyzeRoutes } from './analyze';
import { createRouter } from './router';
import type { RouteEndpoint, RouteRequest, RouteResult } from './types';

/**
 * Regression for parallel links sharing a corridor (reported from a 1.4.0 host): an 8-output
 * manifold whose outputs turn up into stacked inline instruments. Greedy lane assignment gave the
 * topmost output the outermost lane, so every final horizontal run crossed the lanes below it.
 */
function manifoldScene() {
  const obstacles = new Map<string, Rect>();
  const reqs: RouteRequest[] = [];
  const at = (node: string, x: number, y: number, direction: RouteEndpoint['direction']) => {
    const r = obstacles.get(node)!;
    return { nodeId: node, point: { x: r.x + x, y: r.y + y }, direction };
  };
  for (let i = 0; i < 7; i++) {
    obstacles.set(`I${i + 1}`, { x: 1680, y: 120 * i, width: 192, height: 112 });
    obstacles.set(`S${i + 1}`, { x: 1960, y: 120 * i, width: 160, height: 64 });
  }
  obstacles.set('M1', { x: 1400, y: 450, width: 128, height: 288 });
  obstacles.set('M2', { x: 1680, y: 1080, width: 128, height: 192 });
  for (let i = 0; i < 7; i++) {
    reqs.push({
      linkId: `I${i + 1}-S${i + 1}`,
      from: at(`I${i + 1}`, 192, 56, 'right'),
      to: at(`S${i + 1}`, 0, 32, 'left'),
    });
  }
  for (let i = 0; i < 8; i++) {
    const portY = Math.round(((i + 1) / 9) * 288);
    reqs.push({
      linkId: `out-${i + 1}`,
      from: at('M1', 128, portY, 'right'),
      to: i < 7 ? at(`I${i + 1}`, 0, 56, 'left') : at('M2', 0, 96, 'left'),
    });
  }
  return { obstacles, reqs };
}

const laneX = (pts: Point[]) =>
  pts.find((p, i) => i > 0 && p.x === pts[i - 1]!.x && p.y !== pts[i - 1]!.y)?.x;

function crossingsAmong(results: RouteResult[], ids: string[]): number {
  return analyzeRoutes(results.filter((r) => ids.includes(r.linkId))).crossings.length;
}

describe('lane order in shared corridors', () => {
  for (const spacing of [6, 14]) {
    it(`nests lanes so parallel links don't cross (spacing ${spacing})`, () => {
      const { obstacles, reqs } = manifoldScene();
      const router = createRouter({ spacing });
      router.setObstacles(obstacles);
      const results = router.route(reqs);
      const byId = new Map(results.map((r) => [r.linkId, r.points]));
      const up = ['out-1', 'out-2', 'out-3', 'out-4'];
      const lanes = up.map((id) => laneX(byId.get(id)!)!);
      // Turning up: the topmost port takes the lane closest to the source.
      expect(lanes).toEqual([...lanes].sort((a, b) => a - b));
      expect(new Set(lanes).size).toBe(4);
      expect(crossingsAmong(results, up)).toBe(0);
      const all = results.filter((r) => r.linkId.startsWith('out-')).map((r) => r.linkId);
      expect(crossingsAmong(results, all)).toBe(0);
    });
  }

  it('nests links that turn down the other way round', () => {
    const obstacles = new Map<string, Rect>([
      ['a1', { x: 0, y: 0, width: 40, height: 40 }],
      ['a2', { x: 0, y: 100, width: 40, height: 40 }],
      ['b1', { x: 300, y: 300, width: 40, height: 40 }],
      ['b2', { x: 300, y: 400, width: 40, height: 40 }],
    ]);
    const ep = (n: string, x: number, y: number, d: RouteEndpoint['direction']) => {
      const r = obstacles.get(n)!;
      return { nodeId: n, point: { x: r.x + x, y: r.y + y }, direction: d };
    };
    const router = createRouter({ spacing: 6 });
    router.setObstacles(obstacles);
    const results = router.route([
      { linkId: 'l1', from: ep('a1', 40, 20, 'right'), to: ep('b1', 0, 20, 'left') },
      { linkId: 'l2', from: ep('a2', 40, 20, 'right'), to: ep('b2', 0, 20, 'left') },
    ]);
    expect(analyzeRoutes(results).crossings).toHaveLength(0);
    // Turning down: the bottommost port takes the lane closest to the source.
    expect(laneX(results[1]!.points)!).toBeLessThan(laneX(results[0]!.points)!);
  });
});
