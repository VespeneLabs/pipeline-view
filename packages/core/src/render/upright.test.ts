import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Diagram } from '../diagram/diagram';
import type { Rotation } from '../model/types';
import type { SymbolDef } from '../symbols/types';

const TEXT = (x: number, y: number, t: string, size = 20) =>
  `<text x="${x}" y="${y}" text-anchor="middle" style="font:500 ${size}px sans-serif">${t}</text>`;

/** A 60 x 80 bubble: tag letters and a loop number stacked in the circle, a stem below. */
const bubble: SymbolDef = {
  type: 'test/bubble',
  name: 'Bubble',
  category: 'Test',
  size: { width: 60, height: 80 },
  ports: [{ id: 'tap', position: { x: 30, y: 80 }, direction: 'bottom' }],
  render: ({ data }) =>
    `<path d="M30 60V80"/>` +
    TEXT(30, 26.8, String(data.letters ?? 'PT')) +
    TEXT(30, 46.8, String(data.loop ?? '12')),
};
/** Two texts far apart, each belonging to its own part of the drawing. */
const twin: SymbolDef = {
  type: 'test/twin',
  name: 'Twin',
  category: 'Test',
  size: { width: 200, height: 40 },
  ports: [],
  svg: TEXT(20, 26.8, 'A') + TEXT(180, 26.8, 'B'),
};
const stamped: SymbolDef = { ...bubble, type: 'test/stamped', uprightText: false };
const plain: SymbolDef = {
  type: 'test/plain',
  name: 'Plain',
  category: 'Test',
  size: { width: 40, height: 40 },
  ports: [],
  svg: '<path d="M0 0H40"/>',
};

let container: HTMLDivElement;
let d: Diagram;
const texts = (id: string) => [
  ...container.querySelectorAll(`[data-node-id="${id}"] .pv-symbol text`),
];
const transforms = (id: string) => texts(id).map((t) => t.getAttribute('transform'));
const turn = (id: string, patch: { rotation?: Rotation; flipX?: boolean; flipY?: boolean }) => {
  d.update((tx) => tx.updateNode(id, patch));
  d.renderer!.flush();
};

/** Applies an SVG transform list (translate / scale / rotate by quarter turns) to a point or a vector. */
function apply(transform: string, p: { x: number; y: number }, vector = false) {
  let { x, y } = p;
  const ops = [...transform.matchAll(/(translate|scale|rotate)\(([^)]*)\)/g)].reverse();
  for (const [, op, raw] of ops) {
    const a = raw!.split(/[ ,]+/).map(Number);
    if (op === 'translate') {
      if (!vector) [x, y] = [x + a[0]!, y + (a[1] ?? 0)];
    } else if (op === 'scale') {
      [x, y] = [x * a[0]!, y * (a[1] ?? a[0]!)];
    } else {
      const [cx, cy] = vector ? [0, 0] : [a[1] ?? 0, a[2] ?? 0];
      const q = (((a[0]! % 360) + 360) % 360) / 90;
      let [dx, dy] = [x - cx, y - cy];
      for (let i = 0; i < q; i++) [dx, dy] = [-dy, dx];
      [x, y] = [cx + dx, cy + dy];
    }
  }
  return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
}

/** The full transform from a text's own coordinates to the diagram. */
const full = (id: string, i: number) =>
  `${container.querySelector(`[data-node-id="${id}"] .pv-node-body`)!.getAttribute('transform')} ${
    transforms(id)[i] ?? ''
  }`;

/** Diagram position of a point given relative to bubble b's top-left corner (100, 100). */
const at = (x: number, y: number) => ({ x: 100 + x, y: 100 + y });

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  d = new Diagram({ symbols: [bubble, twin, stamped, plain] });
  d.load({
    version: 2,
    nodes: [
      { id: 'b', type: 'test/bubble', position: { x: 100, y: 100 } },
      { id: 't', type: 'test/twin', position: { x: 300, y: 100 } },
      { id: 's', type: 'test/stamped', position: { x: 100, y: 300 }, rotation: 180 },
      { id: 'p', type: 'test/plain', position: { x: 300, y: 300 } },
    ],
    links: [],
  });
  d.mount(container);
  d.renderer!.flush();
});

afterEach(() => {
  d.destroy();
  container.remove();
});

describe('upright text inside symbols', () => {
  it('leaves text alone on a node that is not turned', () => {
    expect(transforms('b')).toEqual([null, null]);
  });

  it.each([
    [{ rotation: 90 as Rotation }],
    [{ rotation: 180 as Rotation }],
    [{ rotation: 270 as Rotation }],
    [{ flipX: true }],
    [{ flipY: true }],
    [{ flipX: true, flipY: true }],
    [{ rotation: 90 as Rotation, flipX: true }],
    [{ rotation: 270 as Rotation, flipY: true }],
  ])('keeps text upright and unmirrored under %j', (patch) => {
    turn('b', patch);
    for (const i of [0, 1]) {
      // Reading direction and "down" are the diagram's own again.
      expect(apply(full('b', i), { x: 1, y: 0 }, true)).toEqual({ x: 1, y: 0 });
      expect(apply(full('b', i), { x: 0, y: 1 }, true)).toEqual({ x: 0, y: 1 });
    }
  });

  it('turns stacked lines as one block, so they keep their place and their order', () => {
    // Line centres are (30, 20) and (30, 40): the block's centre is (30, 30).
    const centreOf = (i: number, y: number) => apply(full('b', i), { x: 30, y });
    const home = at(30, 30);
    expect([centreOf(0, 20), centreOf(1, 40)]).toEqual([
      { x: home.x, y: home.y - 10 },
      { x: home.x, y: home.y + 10 },
    ]);
    turn('b', { flipY: true });
    // Flipped, the block's centre mirrors to local (30, 50) and the letters are still above the loop.
    const flipped = at(30, 50);
    expect([centreOf(0, 20), centreOf(1, 40)]).toEqual([
      { x: flipped.x, y: flipped.y - 10 },
      { x: flipped.x, y: flipped.y + 10 },
    ]);
    turn('b', { flipY: false, rotation: 90 });
    // 60 x 80 turned a quarter around its centre (30, 40): local (30, 30) lands at (40, 40).
    const quarter = at(40, 40);
    expect([centreOf(0, 20), centreOf(1, 40)]).toEqual([
      { x: quarter.x, y: quarter.y - 10 },
      { x: quarter.x, y: quarter.y + 10 },
    ]);
  });

  it('turns texts that are far apart each around its own centre, so each stays with its linework', () => {
    turn('t', { rotation: 180 });
    // 200 x 40 turned half around (100, 20): A's centre (20, 20) lands at (180, 20), B's at (20, 20).
    expect(apply(full('t', 0), { x: 20, y: 20 })).toEqual({ x: 300 + 180, y: 100 + 20 });
    expect(apply(full('t', 1), { x: 180, y: 20 })).toEqual({ x: 300 + 20, y: 100 + 20 });
  });

  it('follows the node back to its unturned state and through data ticks', () => {
    turn('b', { rotation: 180 });
    const turned = transforms('b');
    expect(turned[0]).toMatch(/rotate\(-180\)/);
    d.setNodeData('b', { letters: 'FT' });
    d.renderer!.flush();
    expect(texts('b')[0]!.textContent).toBe('FT');
    expect(transforms('b')).toEqual(turned);
    turn('b', { rotation: 0 });
    expect(transforms('b')).toEqual([null, null]);
  });

  it("keeps a text's own transform and applies it first", () => {
    const own: SymbolDef = {
      ...plain,
      type: 'test/own',
      svg: '<text x="20" y="20" text-anchor="middle" font-size="10" transform="translate(1,2)">x</text>',
    };
    d.symbols.register(own);
    d.update((tx) =>
      tx.addNode({ id: 'o', type: 'test/own', position: { x: 0, y: 0 }, flipX: true }),
    );
    d.renderer!.flush();
    expect(transforms('o')[0]).toBe(
      'translate(20,16.6) scale(-1,1) translate(-20,-16.6) translate(1,2)',
    );
  });

  it('can be turned off per symbol, and costs nothing for symbols without text', () => {
    expect(transforms('s')).toEqual([null, null]);
    const symbol = container.querySelector('[data-node-id="p"] .pv-symbol')!;
    const path = symbol.firstElementChild;
    turn('p', { rotation: 90 });
    // No text: the markup is not rewritten when only the orientation changes.
    expect(symbol.firstElementChild).toBe(path);
  });

  it('keeps text upright in the ghost of a removed node while a comparison is shown', () => {
    const base = d.toJSON();
    base.nodes.find((n) => n.id === 'b')!.rotation = 180;
    d.update((tx) => tx.removeNode('b'));
    d.showDiff(base);
    d.diffLayer!.flush();
    const ghost = [...container.querySelectorAll('[data-diff-node="b"] text')];
    expect(ghost).toHaveLength(2);
    for (const t of ghost) expect(t.getAttribute('transform')).toMatch(/rotate\(-180\)/);
  });
});
