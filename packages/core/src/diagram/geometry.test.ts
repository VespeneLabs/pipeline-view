import { describe, expect, it } from 'vitest';
import type { NodeModel } from '../model/types';
import type { SymbolDef } from '../symbols/types';
import {
  localToDiagram,
  nodeBounds,
  nodeLabelBox,
  nodeLabelPlacement,
  nodeTransform,
  portPoint,
  portPointToward,
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

describe('label position', () => {
  // The box is 100 x 40 at (10, 20); its ports face left and top.
  const at = (extra: Partial<NodeModel>, d: SymbolDef = def) =>
    nodeLabelPlacement(node({ label: 'V-1', ...extra }), d);

  it('keeps the label below the node, or at the symbol anchor, when no side is given', () => {
    expect(at({})).toEqual({ x: 60, y: 76, anchor: 'middle' });
    expect(at({}, { ...def, labelAnchor: { x: 50, y: -4 } })).toEqual({
      x: 60,
      y: 16,
      anchor: 'middle',
    });
    expect(nodeLabelPlacement(node(), def)).toBeNull();
  });

  it('puts the label on the named side of the node as drawn', () => {
    expect(at({ labelPosition: 'bottom' })).toEqual({ x: 60, y: 76, anchor: 'middle' });
    expect(at({ labelPosition: 'top' })).toEqual({ x: 60, y: 13, anchor: 'middle' });
    expect(at({ labelPosition: 'left' })).toEqual({ x: 4, y: 44.5, anchor: 'end' });
    expect(at({ labelPosition: 'right' })).toEqual({ x: 116, y: 44.5, anchor: 'start' });
    // A quarter turn swaps the box to 40 x 100 around the same centre (60, 40).
    expect(at({ labelPosition: 'right', rotation: 90 })).toEqual({
      x: 86,
      y: 44.5,
      anchor: 'start',
    });
    expect(at({ labelPosition: 'right', rotation: 90, flipX: true })).toEqual(
      at({ labelPosition: 'right', rotation: 90 }),
    );
  });

  it('lets the node override the symbol, and a side override the anchor', () => {
    const sided: SymbolDef = { ...def, labelPosition: 'top', labelAnchor: { x: 0, y: 0 } };
    expect(at({}, sided)?.y).toBe(13);
    expect(at({ labelPosition: 'left' }, sided)?.anchor).toBe('end');
  });

  it('picks, for auto, the first side no port faces after rotation and flip', () => {
    const through: SymbolDef = {
      ...def,
      ports: [
        { id: 'in', position: { x: 50, y: 40 }, direction: 'bottom' },
        { id: 'out', position: { x: 50, y: 0 }, direction: 'top' },
      ],
    };
    // Ports at the top and bottom: the label goes to the right.
    expect(at({ labelPosition: 'auto' }, through)?.anchor).toBe('start');
    // Turned a quarter, the line runs left to right and the label fits below again.
    expect(at({ labelPosition: 'auto', rotation: 90 }, through)).toEqual({
      x: 60,
      y: 106,
      anchor: 'middle',
    });
    // The box has ports left and top: below is free at 0 deg; at 180 deg they face right and bottom.
    expect(at({ labelPosition: 'auto' })?.y).toBe(76);
    expect(at({ labelPosition: 'auto', rotation: 180 })?.y).toBe(13);
    const full: SymbolDef = {
      ...through,
      ports: (['left', 'right', 'top', 'bottom'] as const).map((direction) => ({
        id: direction,
        position: { x: 0, y: 0 },
        direction,
      })),
    };
    expect(at({ labelPosition: 'auto' }, full)).toEqual(at({}, full));
  });

  it('estimates the label box from where the text starts', () => {
    const box = (extra: Partial<NodeModel>) =>
      nodeLabelBox(node({ label: 'ABCD', ...extra }), def)!;
    expect(box({ labelPosition: 'left' })).toEqual({ x: -30, y: 31.5, width: 34, height: 17 });
    expect(box({ labelPosition: 'right' })).toEqual({ x: 116, y: 31.5, width: 34, height: 17 });
    expect(box({ labelPosition: 'top' })).toEqual({ x: 43, y: 0, width: 34, height: 17 });
  });
});

describe('port alternates', () => {
  const tapped: SymbolDef = {
    ...def,
    ports: [
      {
        id: 'tap',
        position: { x: 50, y: 40 },
        direction: 'bottom',
        alternates: [{ position: { x: 50, y: 0 }, direction: 'top' }],
      },
    ],
  };
  const toward = (x: number, y: number, extra: Partial<NodeModel> = {}) =>
    portPointToward(node(extra), tapped, 'tap', { x, y });

  it('takes the place that faces the other end', () => {
    expect(toward(60, 300)).toEqual({ id: 'tap', point: { x: 60, y: 60 }, direction: 'bottom' });
    expect(toward(60, -300)).toEqual({ id: 'tap', point: { x: 60, y: 20 }, direction: 'top' });
    expect(toward(200, -100)?.direction).toBe('top');
  });

  it('keeps the port itself on a tie, and follows rotation and flip', () => {
    expect(toward(400, 40)?.direction).toBe('bottom');
    // Flipped upside down, the port itself is the one at the top.
    expect(toward(60, -300, { flipY: true })).toEqual({
      id: 'tap',
      point: { x: 60, y: 20 },
      direction: 'top',
    });
    expect(toward(300, 40, { rotation: 90 })?.direction).toBe('right');
  });

  it('is the plain port without alternates, and undefined for an unknown port', () => {
    expect(portPointToward(node(), def, 'in', { x: 999, y: 999 })).toEqual(
      portPoint(node(), def, 'in'),
    );
    expect(portPointToward(node(), def, 'nope', { x: 0, y: 0 })).toBeUndefined();
  });
});
