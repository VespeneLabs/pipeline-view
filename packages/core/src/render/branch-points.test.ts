import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { branchDirections, partingPoint, pathCrosses, trunkPath } from '../diagram/branch';
import { Diagram } from '../diagram/diagram';
import { getDiff } from '../model/compare';
import type { DiagramModel, Point } from '../model/types';
import type { SymbolDef } from '../symbols/types';

const box: SymbolDef = {
  type: 'test/box',
  name: 'Box',
  category: 'Test',
  size: { width: 40, height: 40 },
  ports: [
    { id: 'in', position: { x: 0, y: 20 }, direction: 'left' },
    { id: 'out', position: { x: 40, y: 20 }, direction: 'right' },
  ],
  svg: '<rect width="40" height="40"/>',
};

/**
 *              b (400, 0)
 *   a (0,100)
 *              c (400, 200)
 *
 * a.out is at (40, 120) and feeds b.in (400, 20) and c.in (400, 220).
 */
const model = (branch?: Point): DiagramModel => ({
  version: 2,
  nodes: [
    {
      id: 'a',
      type: 'test/box',
      position: { x: 0, y: 100 },
      ...(branch ? { branchPoints: { out: branch } } : {}),
    },
    { id: 'b', type: 'test/box', position: { x: 400, y: 0 } },
    { id: 'c', type: 'test/box', position: { x: 400, y: 200 } },
  ],
  links: [
    { id: 'ab', from: { node: 'a', port: 'out' }, to: { node: 'b', port: 'in' }, kind: 'process' },
    { id: 'ac', from: { node: 'a', port: 'out' }, to: { node: 'c', port: 'in' }, kind: 'process' },
  ],
});

let container: HTMLDivElement;
let d: Diagram;
const flush = () => d.renderer!.flush();
const path = (id: string) => d.getLinkPath(id)!;
const dots = () =>
  [...container.querySelectorAll('.pv-junction')].map((c) => ({
    x: Number(c.getAttribute('cx')),
    y: Number(c.getAttribute('cy')),
  }));
const has = (pts: Point[], p: Point) => pts.some((q) => q.x === p.x && q.y === p.y);

function start(m: DiagramModel) {
  d = new Diagram({ symbols: [box] });
  d.load(m);
  d.mount(container);
  flush();
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(() => {
  d?.destroy();
  container.remove();
});

describe('branch point geometry', () => {
  it('runs the trunk straight out of the port and turns once to the point', () => {
    const p = { x: 40, y: 120 };
    expect(trunkPath(p, 'right', { x: 200, y: 120 }, 12)).toEqual([p, { x: 200, y: 120 }]);
    expect(trunkPath(p, 'right', { x: 200, y: 60 }, 12)).toEqual([
      p,
      { x: 200, y: 120 },
      { x: 200, y: 60 },
    ]);
    expect(trunkPath({ x: 20, y: 0 }, 'top', { x: 80, y: -50 }, 12)).toEqual([
      { x: 20, y: 0 },
      { x: 20, y: -50 },
      { x: 80, y: -50 },
    ]);
  });

  it('goes around a stub when the point is beside or behind the port', () => {
    const p = { x: 40, y: 120 };
    expect(trunkPath(p, 'right', { x: 20, y: 200 }, 12)).toEqual([
      p,
      { x: 52, y: 120 },
      { x: 52, y: 200 },
      { x: 20, y: 200 },
    ]);
    expect(trunkPath(p, 'right', p, 12)).toEqual([p, { x: 52, y: 120 }, p]);
  });

  it('tells whether a path runs through a rect, not counting its edges', () => {
    const r = { x: 100, y: 100, width: 50, height: 50 };
    expect(
      pathCrosses(
        [
          { x: 0, y: 120 },
          { x: 300, y: 120 },
        ],
        [r],
      ),
    ).toBe(true);
    expect(
      pathCrosses(
        [
          { x: 0, y: 100 },
          { x: 300, y: 100 },
        ],
        [r],
      ),
    ).toBe(false);
    expect(
      pathCrosses(
        [
          { x: 0, y: 120 },
          { x: 100, y: 120 },
        ],
        [r],
      ),
    ).toBe(false);
    expect(
      pathCrosses(
        [
          { x: 0, y: 0 },
          { x: 0, y: 300 },
        ],
        [r],
      ),
    ).toBe(false);
  });

  it('gives each link its own way out of the branch point, never back along the trunk', () => {
    const at = { x: 200, y: 120 };
    const dirs = branchDirections(
      at,
      'right',
      new Map([
        ['up', { x: 400, y: 20 }],
        ['down', { x: 400, y: 220 }],
        ['ahead', { x: 600, y: 130 }],
        ['behind', { x: 0, y: 125 }],
      ]),
    );
    // Both "up" and "down" would like to go right; the first takes it, the second its other axis.
    expect(Object.fromEntries(dirs)).toEqual({
      up: 'right',
      down: 'bottom',
      ahead: 'top',
      // Never left (back along the trunk), and nothing is free: it shares its first choice.
      behind: 'bottom',
    });
  });

  it('finds where paths from one point part', () => {
    const a = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: -50 },
    ];
    const b = [
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 80 },
    ];
    const c = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ];
    expect(partingPoint([a, b])).toEqual({ x: 60, y: 0 });
    expect(partingPoint([a, c])).toEqual({ x: 100, y: 0 });
    expect(partingPoint([a, a])).toEqual({ x: 100, y: -50 });
    expect(
      partingPoint([
        a,
        [
          { x: 0, y: 0 },
          { x: 0, y: 9 },
        ],
      ]),
    ).toEqual({ x: 0, y: 0 });
    expect(partingPoint([a])).toBeUndefined();
    expect(
      partingPoint([
        a,
        [
          { x: 1, y: 0 },
          { x: 5, y: 0 },
        ],
      ]),
    ).toBeUndefined();
  });
});

describe('host-given branch points', () => {
  it('lets the router decide without an entry, and reports where the links part', () => {
    start(model());
    const natural = d.getBranchPoint('a', 'out')!;
    expect(natural.fixed).toBe(false);
    expect(has(path('ab'), natural.point)).toBe(true);
    expect(has(path('ac'), natural.point)).toBe(true);
    expect(d.getBranchPoint('b', 'in')).toBeUndefined();
  });

  it('runs both links along one trunk to the point and parts them there, with a dot', () => {
    // 160 right of a's top-left, at the port's height: the point is (160, 120).
    start(model({ x: 160, y: 20 }));
    for (const id of ['ab', 'ac']) {
      expect(path(id).slice(0, 2)).toEqual([
        { x: 40, y: 120 },
        { x: 160, y: 120 },
      ]);
    }
    expect(path('ab').at(-1)).toEqual({ x: 400, y: 20 });
    expect(path('ac').at(-1)).toEqual({ x: 400, y: 220 });
    // They leave the point in different directions.
    expect(path('ab')[2]).not.toEqual(path('ac')[2]);
    expect(dots()).toEqual([{ x: 160, y: 120 }]);
    expect(d.getBranchPoint('a', 'out')).toEqual({ point: { x: 160, y: 120 }, fixed: true });
  });

  it('travels with the node', () => {
    start(model({ x: 160, y: 20 }));
    d.update((tx) => tx.updateNode('a', { position: { x: 0, y: 140 } }));
    flush();
    expect(path('ab').slice(0, 2)).toEqual([
      { x: 40, y: 160 },
      { x: 160, y: 160 },
    ]);
    expect(dots()).toEqual([{ x: 160, y: 160 }]);
  });

  it('follows the model: set, moved and cleared through updates, each undoable', () => {
    start(model());
    d.update((tx) => tx.updateNode('a', { branchPoints: { out: { x: 160, y: 20 } } }));
    flush();
    expect(dots()).toEqual([{ x: 160, y: 120 }]);
    d.update((tx) => tx.updateNode('a', { branchPoints: { out: { x: 260, y: 60 } } }));
    flush();
    // The trunk leaves the port, runs to x = 260 and turns down to the point.
    expect(path('ab').slice(0, 3)).toEqual([
      { x: 40, y: 120 },
      { x: 260, y: 120 },
      { x: 260, y: 160 },
    ]);
    expect(dots()).toEqual([{ x: 260, y: 160 }]);
    d.undo();
    flush();
    expect(dots()).toEqual([{ x: 160, y: 120 }]);
    d.update((tx) => tx.updateNode('a', { branchPoints: undefined }));
    flush();
    expect(d.getBranchPoint('a', 'out')!.fixed).toBe(false);
    expect(d.toJSON().nodes[0]!.branchPoints).toBeUndefined();
  });

  it('keeps the branch point where it is when one of the links is re-routed', () => {
    start(model({ x: 160, y: 20 }));
    d.update((tx) => tx.updateNode('c', { position: { x: 300, y: 400 } }));
    flush();
    expect(d.getBranchPoint('a', 'out')).toEqual({ point: { x: 160, y: 120 }, fixed: true });
    expect(path('ab').slice(0, 2)).toEqual([
      { x: 40, y: 120 },
      { x: 160, y: 120 },
    ]);
    expect(path('ac').slice(0, 2)).toEqual([
      { x: 40, y: 120 },
      { x: 160, y: 120 },
    ]);
    expect(dots()).toContainEqual({ x: 160, y: 120 });
  });

  it('is ignored for a port with a single link, and takes effect when a second one arrives', () => {
    const m = model({ x: 160, y: 20 });
    const second = m.links.pop()!;
    start(m);
    expect(d.getBranchPoint('a', 'out')).toBeUndefined();
    expect(dots()).toEqual([]);
    d.update((tx) => tx.addLink(second));
    flush();
    expect(dots()).toEqual([{ x: 160, y: 120 }]);
    expect(path('ab')[1]).toEqual({ x: 160, y: 120 });
    d.update((tx) => tx.removeLink('ac'));
    flush();
    expect(dots()).toEqual([]);
  });

  it('is ignored while its trunk would run through a node, and comes back when the way is free', () => {
    const m = model({ x: 260, y: 20 });
    m.nodes.push({ id: 'wall', type: 'test/box', position: { x: 120, y: 100 } });
    start(m);
    expect(d.getBranchPoint('a', 'out')!.fixed).toBe(false);
    d.update((tx) => tx.updateNode('wall', { position: { x: 120, y: 400 } }));
    flush();
    expect(d.getBranchPoint('a', 'out')).toEqual({ point: { x: 260, y: 120 }, fixed: true });
    expect(path('ab')[1]).toEqual({ x: 260, y: 120 });
    d.update((tx) => tx.updateNode('wall', { position: { x: 120, y: 100 } }));
    flush();
    expect(d.getBranchPoint('a', 'out')!.fixed).toBe(false);
  });

  it('works for links that merge into a port', () => {
    const m: DiagramModel = {
      version: 2,
      nodes: [
        { id: 'b', type: 'test/box', position: { x: 0, y: 0 } },
        { id: 'c', type: 'test/box', position: { x: 0, y: 200 } },
        {
          id: 'z',
          type: 'test/box',
          position: { x: 400, y: 100 },
          branchPoints: { in: { x: -100, y: 20 } },
        },
      ],
      links: [
        {
          id: 'bz',
          from: { node: 'b', port: 'out' },
          to: { node: 'z', port: 'in' },
          kind: 'process',
        },
        {
          id: 'cz',
          from: { node: 'c', port: 'out' },
          to: { node: 'z', port: 'in' },
          kind: 'process',
        },
      ],
    };
    start(m);
    for (const id of ['bz', 'cz']) {
      expect(path(id).slice(-2)).toEqual([
        { x: 300, y: 120 },
        { x: 400, y: 120 },
      ]);
    }
    expect(dots()).toEqual([{ x: 300, y: 120 }]);
  });

  it('leaves manual links and attached ends out of the fan', () => {
    const m = model({ x: 160, y: 20 });
    m.links[1] = { ...m.links[1]!, routing: 'manual', waypoints: [{ x: 100, y: 300 }] };
    start(m);
    // One auto-routed link left on the port: no fan.
    expect(d.getBranchPoint('a', 'out')).toBeUndefined();
    expect(path('ac')).toEqual([
      { x: 40, y: 120 },
      { x: 100, y: 300 },
      { x: 400, y: 220 },
    ]);
  });

  it('counts a branch point change as "moved" in a comparison, and round-trips', () => {
    const base = model();
    const set = model({ x: 160, y: 20 });
    expect(getDiff(base, set).nodes).toEqual([{ id: 'a', mark: 'moved' }]);
    expect(getDiff(set, model({ x: 200, y: 20 })).nodes).toEqual([{ id: 'a', mark: 'moved' }]);
    expect(getDiff(set, model({ x: 160, y: 20 })).nodes).toEqual([]);
    const empty = model();
    empty.nodes[0]!.branchPoints = {};
    expect(getDiff(base, empty).nodes).toEqual([]);
    start(set);
    expect(d.toJSON().nodes[0]!.branchPoints).toEqual({ out: { x: 160, y: 20 } });
  });
});
