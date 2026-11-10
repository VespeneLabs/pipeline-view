import { describe, expect, it } from 'vitest';
import type { NodeModel } from '../model/types';
import type { SymbolDef } from '../symbols/types';
import {
  localToDiagram,
  nodeBounds,
  nodeTransform,
  portPoint,
  transformDirection,
} from './geometry';

const def: SymbolDef = {
  type: 't/box',
  name: 'Box',
  category: 'T',
  size: { width: 100, height: 40 },
  ports: [
    { id: 'in', position: { x: 0, y: 20 }, direction: 'left' },
    { id: 'top', position: { x: 80, y: 0 }, direction: 'top' },
  ],
};
const node = (extra: Partial<NodeModel> = {}): NodeModel => ({
  id: 'n',
  type: 't/box',
  position: { x: 10, y: 20 },
  ...extra,
});

/** Applies an SVG transform string (translate / rotate(a,cx,cy) / scale only) to a point, to cross-check nodeTransform. */
function applySvgTransform(t: string, p: { x: number; y: number }) {
  const ops = [...t.matchAll(/(\w+)\(([^)]*)\)/g)].map(
    ([, f, a]) => [f!, a!.split(',').map(Number)] as const,
  );
  let { x, y } = p;
  for (const [f, a] of ops.reverse()) {
    if (f === 'translate') [x, y] = [x + a[0]!, y + a[1]!];
    else if (f === 'scale') [x, y] = [x * a[0]!, y * a[1]!];
    else if (f === 'rotate') {
      const r = (a[0]! * Math.PI) / 180;
      const [cx, cy] = [a[1]!, a[2]!];
      const [dx, dy] = [x - cx, y - cy];
      [x, y] = [cx + dx * Math.cos(r) - dy * Math.sin(r), cy + dx * Math.sin(r) + dy * Math.cos(r)];
    }
  }
  return { x: Math.round(x * 1e6) / 1e6, y: Math.round(y * 1e6) / 1e6 };
}

describe('geometry', () => {
  it('keeps unrotated bounds at position', () => {
    expect(nodeBounds(node(), def)).toEqual({ x: 10, y: 20, width: 100, height: 40 });
  });

  it('swaps bounds about the center at 90/270', () => {
    expect(nodeBounds(node({ rotation: 90 }), def)).toEqual({
      x: 40,
      y: -10,
      width: 40,
      height: 100,
    });
  });

  it('rotates ports clockwise (SVG y-down)', () => {
    // Left-middle port at 90° ends up top-center.
    expect(portPoint(node({ rotation: 90 }), def, 'in')).toEqual({
      id: 'in',
      point: { x: 60, y: -10 },
      direction: 'top',
    });
    expect(transformDirection(node({ rotation: 270 }), 'left')).toBe('bottom');
    expect(transformDirection(node({ rotation: 180 }), 'top')).toBe('bottom');
  });

  it('flips before rotating', () => {
    expect(portPoint(node({ flipX: true }), def, 'in')).toEqual({
      id: 'in',
      point: { x: 110, y: 40 },
      direction: 'right',
    });
    expect(transformDirection(node({ flipX: true, rotation: 90 }), 'left')).toBe('bottom');
  });

  it('nodeTransform agrees with localToDiagram for every rotation and flip', () => {
    for (const rotation of [0, 90, 180, 270] as const)
      for (const flipX of [false, true])
        for (const flipY of [false, true]) {
          const n = node({ rotation, flipX, flipY });
          for (const p of [
            { x: 0, y: 20 },
            { x: 80, y: 0 },
            { x: 13, y: 37 },
          ]) {
            expect(applySvgTransform(nodeTransform(n, def), p)).toEqual(localToDiagram(n, def, p));
          }
        }
  });

  it('returns undefined for unknown ports and falls back for unknown symbols', () => {
    expect(portPoint(node(), def, 'nope')).toBeUndefined();
    expect(nodeBounds(node(), undefined)).toEqual({ x: 10, y: 20, width: 40, height: 40 });
  });
});
