import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attachCycle, fractionAlong, pointAlong } from '../diagram/attach';
import { Diagram } from '../diagram/diagram';
import { getDiff } from '../model/compare';
import type { DiagramModel, LinkModel, Point } from '../model/types';
import type { SymbolDef } from '../symbols/types';

const box: SymbolDef = {
  type: 'test/box',
  name: 'Box',
  category: 'Test',
  size: { width: 40, height: 40 },
  ports: [
    { id: 'in', position: { x: 0, y: 20 }, direction: 'left' },
    { id: 'out', position: { x: 40, y: 20 }, direction: 'right' },
    { id: 'top', position: { x: 20, y: 0 }, direction: 'top' },
    { id: 'bottom', position: { x: 20, y: 40 }, direction: 'bottom' },
  ],
  svg: '<rect width="40" height="40"/>',
};

/**
 *   a ────────────── b        main: a.out -> b.in, a straight run at y = 20 from x = 40 to x = 400
 *
 *           c                 side: c.top -> b.in, drawn onto main
 */
const model = (side: Partial<LinkModel> = {}): DiagramModel => ({
  version: 2,
  nodes: [
    { id: 'a', type: 'test/box', position: { x: 0, y: 0 } },
    { id: 'b', type: 'test/box', position: { x: 400, y: 0 } },
    { id: 'c', type: 'test/box', position: { x: 200, y: 200 } },
  ],
  links: [
    {
      id: 'main',
      from: { node: 'a', port: 'out' },
      to: { node: 'b', port: 'in' },
      kind: 'process',
    },
    {
      id: 'side',
      from: { node: 'c', port: 'top' },
      to: { node: 'b', port: 'in' },
      kind: 'process',
      toAttach: { link: 'main', at: 0.5 },
      ...side,
    },
  ],
});

let container: HTMLDivElement;
let d: Diagram;
const flush = () => d.renderer!.flush();
const path = (id: string) => d.getLinkPath(id)!;
const last = (pts: Point[]) => pts[pts.length - 1]!;
const dots = () =>
  [...container.querySelectorAll('.pv-junction')].map((c) => ({
    x: Number(c.getAttribute('cx')),
    y: Number(c.getAttribute('cy')),
  }));
const occupied = (node: string, port: string) =>
  container
    .querySelector(`[data-node-id="${node}"] [data-port-id="${port}"]`)!
    .hasAttribute('data-occupied');
const linkEl = (id: string) => container.querySelector(`[data-link-id="${id}"]`)!;

function start(m: DiagramModel, options: ConstructorParameters<typeof Diagram>[0] = {}) {
  d = new Diagram({ symbols: [box], ...options });
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

describe('route fractions', () => {
  const route = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 50 },
    { x: 150, y: 50 },
  ];

  it('finds the point at a fraction of an orthogonal route, on the right segment', () => {
    expect(pointAlong(route, 0)).toEqual({ point: { x: 0, y: 0 }, segment: 0, horizontal: true });
    expect(pointAlong(route, 0.25)).toEqual({
      point: { x: 50, y: 0 },
      segment: 0,
      horizontal: true,
    });
    expect(pointAlong(route, 0.6)).toEqual({
      point: { x: 100, y: 20 },
      segment: 1,
      horizontal: false,
    });
    expect(pointAlong(route, 1)).toEqual({
      point: { x: 150, y: 50 },
      segment: 2,
      horizontal: true,
    });
  });

  it('clamps the fraction, rounds along the segment and copes with degenerate routes', () => {
    expect(pointAlong(route, -3)!.point).toEqual({ x: 0, y: 0 });
    expect(pointAlong(route, 7)!.point).toEqual({ x: 150, y: 50 });
    expect(pointAlong(route, NaN)!.point).toEqual({ x: 0, y: 0 });
    expect(pointAlong(route, 0.333)!.point).toEqual({ x: 67, y: 0 });
    // The other coordinate is the segment's own, so the point lies exactly on a half-unit lane.
    expect(
      pointAlong(
        [
          { x: 0, y: 7.5 },
          { x: 9, y: 7.5 },
        ],
        0.5,
      )!.point,
    ).toEqual({ x: 5, y: 7.5 });
    expect(pointAlong([{ x: 1, y: 1 }], 0.5)).toBeUndefined();
    expect(
      pointAlong(
        [
          { x: 1, y: 1 },
          { x: 1, y: 1 },
        ],
        0.5,
      )!.point,
    ).toEqual({ x: 1, y: 1 });
  });

  it('finds the fraction nearest to a point, the inverse of pointAlong', () => {
    expect(fractionAlong(route, { x: 50, y: -30 })).toBe(0.25);
    expect(fractionAlong(route, { x: 130, y: 20 })).toBe(0.6);
    expect(fractionAlong(route, { x: 500, y: 500 })).toBe(1);
    expect(fractionAlong(route, { x: -500, y: 0 })).toBe(0);
    expect(fractionAlong([{ x: 1, y: 1 }], { x: 0, y: 0 })).toBe(0);
  });

  it('detects loops of attachments', () => {
    const links = new Map<string, LinkModel>();
    const end = { node: 'n', port: 'p' };
    const link = (id: string, host?: string): LinkModel => ({
      id,
      from: end,
      to: end,
      kind: 'process',
      ...(host ? { toAttach: { link: host, at: 0.5 } } : {}),
    });
    for (const l of [link('x'), link('y', 'x'), link('z', 'y')]) links.set(l.id, l);
    expect(attachCycle(links, 'x', 'x')).toBe(true);
    expect(attachCycle(links, 'x', 'z')).toBe(true);
    expect(attachCycle(links, 'z', 'x')).toBe(false);
    expect(attachCycle(links, 'new', 'z')).toBe(false);
  });
});

describe('link ends attached to another link', () => {
  it('draws the end on the host link at the given fraction, with a junction dot', () => {
    start(model());
    expect(path('main')).toEqual([
      { x: 40, y: 20 },
      { x: 400, y: 20 },
    ]);
    // Halfway along main: straight above c's top port, so the side link is one vertical run.
    expect(path('side')).toEqual([
      { x: 220, y: 200 },
      { x: 220, y: 20 },
    ]);
    expect(dots()).toEqual([{ x: 220, y: 20 }]);
    expect(linkEl('side').hasAttribute('data-attached')).toBe(true);
    expect(linkEl('main').hasAttribute('data-attached')).toBe(false);
  });

  it('keeps from / to as the logical ends: the port of an attached end is not marked occupied', () => {
    const only: DiagramModel = model();
    only.links = [only.links[1]!, { ...only.links[0]!, to: { node: 'b', port: 'top' } }];
    start(only);
    expect(d.toJSON().links.find((l) => l.id === 'side')!.to).toEqual({ node: 'b', port: 'in' });
    expect(occupied('b', 'in')).toBe(false);
    expect(occupied('b', 'top')).toBe(true);
    expect(occupied('c', 'top')).toBe(true);
  });

  it('routes the host first whatever the order in the model', () => {
    const m = model();
    m.links.reverse();
    start(m);
    expect(last(path('side'))).toEqual({ x: 220, y: 20 });
  });

  it('follows the host link when it re-routes', () => {
    start(model());
    d.update((tx) => tx.updateNode('b', { position: { x: 600, y: 0 } }));
    flush();
    // main now runs from x = 40 to x = 600; its middle is x = 320.
    expect(last(path('side'))).toEqual({ x: 320, y: 20 });
    expect(dots()).toEqual([{ x: 320, y: 20 }]);
    d.update((tx) => tx.updateNode('a', { position: { x: 0, y: 100 } }));
    flush();
    const main = path('main');
    const end = last(path('side'));
    expect(pointAlong(main, 0.5)!.point).toEqual(end);
    expect(dots()).toContainEqual(end);
  });

  it('moves along the host when `at` changes, in one undo step', () => {
    start(model());
    d.update((tx) => tx.updateLink('side', { toAttach: { link: 'main', at: 0.25 } }));
    flush();
    expect(last(path('side'))).toEqual({ x: 130, y: 20 });
    d.undo();
    flush();
    expect(last(path('side'))).toEqual({ x: 220, y: 20 });
  });

  it('leaves the host at a right angle, on the side of its other end', () => {
    start(model());
    const below = path('side');
    expect(below[below.length - 2]!.x).toBe(220);
    expect(below[below.length - 2]!.y).toBeGreaterThan(20);
    d.update((tx) => tx.updateNode('c', { position: { x: 200, y: -300 } }));
    flush();
    const above = path('side');
    expect(above[above.length - 2]!.x).toBe(220);
    expect(above[above.length - 2]!.y).toBeLessThan(20);
  });

  it('attaches the from end too, and both ends at once', () => {
    start(
      model({
        from: { node: 'a', port: 'out' },
        to: { node: 'c', port: 'top' },
        fromAttach: { link: 'main', at: 0.5 },
        toAttach: undefined,
      }),
    );
    expect(path('side')[0]).toEqual({ x: 220, y: 20 });
    expect(last(path('side'))).toEqual({ x: 220, y: 200 });
    expect(occupied('c', 'top')).toBe(true);
  });

  it('keeps manual waypoints between an attached end and a port', () => {
    start(model({ routing: 'manual', waypoints: [{ x: 300, y: 150 }] }));
    expect(path('side')).toEqual([
      { x: 220, y: 200 },
      { x: 300, y: 150 },
      { x: 220, y: 20 },
    ]);
  });

  it('supports a link attached to an attached link', () => {
    const m = model();
    m.nodes.push({ id: 'e', type: 'test/box', position: { x: 0, y: 300 } });
    m.links.unshift({
      id: 'third',
      from: { node: 'e', port: 'out' },
      to: { node: 'b', port: 'in' },
      kind: 'process',
      toAttach: { link: 'side', at: 0.5 },
    });
    start(m);
    // side runs from (220, 200) up to (220, 20); its middle is (220, 110).
    expect(last(path('third'))).toEqual({ x: 220, y: 110 });
    d.update((tx) => tx.updateNode('b', { position: { x: 600, y: 0 } }));
    flush();
    expect(last(path('third'))).toEqual(pointAlong(path('side'), 0.5)!.point);
  });

  it('shows the dot of an attached end even when merge dots are turned off', () => {
    start(model(), { mergeJunctions: false });
    // Both links end on b.in, which would hide a plain merge dot.
    expect(dots()).toEqual([{ x: 220, y: 20 }]);
  });

  it('draws an end from its port when the host is missing or the attachments form a loop', () => {
    start(model({ toAttach: { link: 'nope', at: 0.5 } }));
    expect(last(path('side'))).toEqual({ x: 400, y: 20 });
    expect(linkEl('side').hasAttribute('data-attached')).toBe(false);
    expect(occupied('b', 'in')).toBe(true);
    d.destroy();

    const loop = model({ toAttach: { link: 'side', at: 0.5 } });
    start(loop);
    expect(last(path('side'))).toEqual({ x: 400, y: 20 });
    d.destroy();

    const pair = model();
    pair.links[0]!.fromAttach = { link: 'side', at: 0.5 };
    start(pair);
    expect(path('main')[0]).toEqual({ x: 40, y: 20 });
    expect(last(path('side'))).toEqual({ x: 400, y: 20 });
  });

  it('detaches the ends on a deleted link in the same undo step, and undo brings both back', () => {
    start(model());
    const changes: unknown[] = [];
    d.on('modelChange', (e) => changes.push(e.diff));
    d.update((tx) => tx.removeLink('main'));
    flush();
    const side = d.toJSON().links.find((l) => l.id === 'side')!;
    expect(side.toAttach).toBeUndefined();
    expect(last(path('side'))).toEqual({ x: 400, y: 20 });
    expect(linkEl('side').hasAttribute('data-attached')).toBe(false);
    expect(dots()).toEqual([]);
    expect(changes).toHaveLength(1);
    d.undo();
    flush();
    expect(d.toJSON().links.find((l) => l.id === 'side')!.toAttach).toEqual({
      link: 'main',
      at: 0.5,
    });
    expect(last(path('side'))).toEqual({ x: 220, y: 20 });
  });

  it('detaches the ends on links that go away with a removed node', () => {
    start(model({ to: { node: 'c', port: 'out' }, from: { node: 'c', port: 'top' } }));
    d.update((tx) => tx.removeNode('a'));
    flush();
    const side = d.toJSON().links.find((l) => l.id === 'side')!;
    expect(side.toAttach).toBeUndefined();
    expect(last(path('side'))).toEqual({ x: 240, y: 220 });
  });

  it('detaches the same way when the host is removed through applyDiff', () => {
    start(model());
    d.applyDiff({ links: { removed: ['main'] } });
    flush();
    expect(d.toJSON().links[0]!.toAttach).toBeUndefined();
    expect(last(path('side'))).toEqual({ x: 400, y: 20 });
  });

  it('counts attaching, detaching and moving along the host as "moved" in a comparison', () => {
    const base = model();
    const moved = model({ toAttach: { link: 'main', at: 0.8 } });
    const detached = model({ toAttach: undefined });
    expect(getDiff(base, moved).links).toEqual([{ id: 'side', mark: 'moved' }]);
    expect(getDiff(base, detached).links).toEqual([{ id: 'side', mark: 'moved' }]);
    expect(getDiff(detached, base).links).toEqual([{ id: 'side', mark: 'moved' }]);
    expect(getDiff(base, model()).links).toEqual([]);
  });

  it('round-trips through toJSON and survives export', () => {
    start(model());
    expect(d.toJSON().links[1]!.toAttach).toEqual({ link: 'main', at: 0.5 });
    const doc = new DOMParser().parseFromString(d.exportSVG(), 'image/svg+xml');
    expect(doc.querySelectorAll('.pv-junction')).toHaveLength(1);
  });
});
