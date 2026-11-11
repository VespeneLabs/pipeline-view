import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Diagram } from '../diagram/diagram';
import type { DiagramModel } from '../model/types';
import type { SymbolDef } from '../symbols/types';
import { analyzeRoutes } from '../routing/analyze';

const valve: SymbolDef = {
  type: 'test/valve',
  name: 'Valve',
  category: 'Test',
  size: { width: 40, height: 20 },
  ports: [
    { id: 'in', position: { x: 0, y: 10 }, direction: 'left' },
    { id: 'out', position: { x: 40, y: 10 }, direction: 'right' },
  ],
  svg: '<path d="M0 10H40"/>',
  render: ({ data }) =>
    data.open === false ? '<path d="M0 10H40" fill="currentColor"/>' : '<path d="M0 10H40"/>',
};

const model = (): DiagramModel => ({
  version: 2,
  nodes: [
    { id: 'a', type: 'test/valve', position: { x: 0, y: 0 }, label: 'V-1' },
    { id: 'b', type: 'test/valve', position: { x: 200, y: 0 } },
    { id: 'c', type: 'test/valve', position: { x: 200, y: 200 } },
  ],
  links: [
    { id: 'ab', from: { node: 'a', port: 'out' }, to: { node: 'b', port: 'in' }, kind: 'process' },
    { id: 'bc', from: { node: 'b', port: 'out' }, to: { node: 'c', port: 'in' }, kind: 'signal' },
  ],
});

let container: HTMLDivElement;
let d: Diagram;
const $ = (sel: string) => container.querySelector(sel);
const $$ = (sel: string) => [...container.querySelectorAll(sel)];

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  d = new Diagram({ symbols: [valve] });
  d.load(model());
  d.mount(container);
  d.renderer!.flush();
});

afterEach(() => {
  d.destroy();
  container.remove();
});

describe('SvgRenderer', () => {
  it('routes links around node labels, follows label edits, and can be turned off', () => {
    const box: SymbolDef = {
      type: 'test/box',
      name: 'Box',
      category: 'Test',
      size: { width: 40, height: 20 },
      ports: [
        { id: 'in', position: { x: 0, y: 10 }, direction: 'left' },
        { id: 'out', position: { x: 40, y: 10 }, direction: 'right' },
      ],
    };
    // L and R are level with M's label (drawn 16 below M, so around y 23..40): a straight pipe at
    // y 33 would cut through the text.
    const scene = (label: string | undefined): DiagramModel => ({
      version: 2,
      nodes: [
        { id: 'M', type: 'test/box', position: { x: 0, y: 0 }, label },
        { id: 'L', type: 'test/box', position: { x: -200, y: 23 } },
        { id: 'R', type: 'test/box', position: { x: 200, y: 23 } },
      ],
      links: [
        {
          id: 'lr',
          from: { node: 'L', port: 'out' },
          to: { node: 'R', port: 'in' },
          kind: 'process',
        },
      ],
    });
    const path = (dd: Diagram) => dd.getLinkPath('lr')!;
    const run = (opts: { routeAroundLabels?: boolean }, label?: string) => {
      const c = document.createElement('div');
      document.body.append(c);
      const dd = new Diagram({ symbols: [box], ...opts });
      dd.load(scene(label));
      dd.mount(c);
      dd.renderer!.flush();
      return { dd, c };
    };
    const straight = (pts: { x: number; y: number }[]) => pts.length === 2;

    const plain = run({}, undefined);
    expect(straight(path(plain.dd))).toBe(true);
    // A label under M now sits in the way: the pipe goes around it.
    plain.dd.update((tx) => tx.updateNode('M', { label: 'process1 line 5 flow' }));
    plain.dd.renderer!.flush();
    const around = path(plain.dd);
    expect(straight(around)).toBe(false);
    for (let i = 0; i + 1 < around.length; i++) {
      const a = around[i]!;
      const b = around[i + 1]!;
      // No horizontal run passes through the label's band under M.
      if (a.y === b.y && a.y > 19 && a.y < 44) {
        expect(Math.max(a.x, b.x) < -65 || Math.min(a.x, b.x) > 105).toBe(true);
      }
    }
    // Removing the label frees the straight route again.
    plain.dd.update((tx) => tx.updateNode('M', { label: undefined }));
    plain.dd.renderer!.flush();
    expect(straight(path(plain.dd))).toBe(true);
    plain.dd.destroy();
    plain.c.remove();

    const off = run({ routeAroundLabels: false }, 'process1 line 5 flow');
    expect(straight(path(off.dd))).toBe(true);
    off.dd.destroy();
    off.c.remove();
  });

  it('draws link labels on the route, names the link for assistive tech, and removes them', () => {
    d.update((tx) => tx.updateLink('ab', { label: 'Yes' }));
    d.renderer!.flush();
    const t = $('[data-link-id="ab"] .pv-link-label')!;
    expect(t.textContent).toBe('Yes');
    // ab runs straight from (40,10) to (200,10): the label sits on its middle.
    expect([t.getAttribute('x'), t.getAttribute('y')]).toEqual(['120', '10']);
    expect($('[data-link-id="ab"]')!.getAttribute('aria-label')).toBe('Yes, V-1 to b');
    // labelPosition is honoured where the spot is free...
    d.update((tx) => tx.updateLink('ab', { labelPosition: 0.75 }));
    d.renderer!.flush();
    expect($('[data-link-id="ab"] .pv-link-label')!.getAttribute('x')).toBe('160');
    // ...and is a preference where it is not: at 0 the label would cover node a (x 0..40), so it
    // slides along the link until its box (33 wide) is clear of the node.
    d.update((tx) => tx.updateLink('ab', { labelPosition: 0 }));
    d.renderer!.flush();
    expect($('[data-link-id="ab"] .pv-link-label')!.getAttribute('x')).toBe('60');
    d.update((tx) => tx.updateLink('ab', { label: undefined }));
    d.renderer!.flush();
    expect($('[data-link-id="ab"] .pv-link-label')).toBeNull();
    expect($('[data-link-id="ab"]')!.hasAttribute('aria-label')).toBe(false);
  });

  it('keeps the labels of links converging on one target apart, and re-places them as things move', () => {
    const link = (id: string, from: string, label: string) => ({
      id,
      from: { node: from, port: 'out' },
      to: { node: 't', port: 'in' },
      kind: 'process' as const,
      label,
    });
    // Three sources stacked left of one target: the links share the corridor into t's in port.
    const scene = (order: string[]): DiagramModel => ({
      version: 2,
      nodes: [
        { id: 's1', type: 'test/valve', position: { x: 0, y: 0 } },
        { id: 's2', type: 'test/valve', position: { x: 0, y: 60 } },
        { id: 's3', type: 'test/valve', position: { x: 0, y: 120 } },
        { id: 't', type: 'test/valve', position: { x: 500, y: 60 } },
        { id: 'far', type: 'test/valve', position: { x: 600, y: 600 } },
      ],
      links: order.map((id) => link(id, 's' + id.slice(1), 'Option ' + id.slice(1))),
    });
    const mountScene = (order: string[]) => {
      const c = document.createElement('div');
      document.body.append(c);
      const dd = new Diagram({ symbols: [valve] });
      dd.load(scene(order));
      dd.mount(c);
      dd.renderer!.flush();
      return { dd, c };
    };
    // The label's estimated box, from its text and position, as the renderer sizes it.
    const boxes = (c: HTMLElement) =>
      [...c.querySelectorAll('.pv-link-label')]
        .map((t) => {
          const w = t.textContent!.length * 7 + 12;
          const id = (t.parentNode as SVGElement).dataset.linkId!;
          expect(t.getAttribute('visibility')).toBeNull();
          return { id, x: +t.getAttribute('x')! - w / 2, y: +t.getAttribute('y')! - 10, w, h: 20 };
        })
        .sort((a, b) => (a.id < b.id ? -1 : 1));
    const overlapping = (bs: ReturnType<typeof boxes>) =>
      bs.some((a, i) =>
        bs.some(
          (b, j) =>
            j > i && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h,
        ),
      );

    const one = mountScene(['l1', 'l2', 'l3']);
    const placed = boxes(one.c);
    expect(placed).toHaveLength(3);
    expect(overlapping(placed)).toBe(false);

    // The same links loaded in another order get the same places.
    const two = mountScene(['l3', 'l1', 'l2']);
    expect(boxes(two.c)).toEqual(placed);
    two.dd.destroy();
    two.c.remove();

    // A node dropped onto a label (no link is attached to it, so nothing reroutes) pushes it away.
    const l1 = placed[0]!;
    const texts = () => [...one.c.querySelectorAll('.pv-link-label')];
    const setAttr = texts().map((t) => vi.spyOn(t, 'setAttribute'));
    one.dd.update((tx) => tx.updateNode('far', { position: { x: 600, y: 640 } }));
    one.dd.renderer!.flush();
    // A move far from every label touches none of them.
    for (const s of setAttr) expect(s).not.toHaveBeenCalled();
    const routes = ['l1', 'l2', 'l3'].map((id) => one.dd.getLinkPath(id));
    one.dd.update((tx) =>
      tx.updateNode('far', { position: { x: l1.x + l1.w / 2 - 20, y: l1.y + l1.h / 2 - 10 } }),
    );
    one.dd.renderer!.flush();
    const after = boxes(one.c);
    if (
      JSON.stringify(routes) ===
      JSON.stringify(['l1', 'l2', 'l3'].map((id) => one.dd.getLinkPath(id)))
    ) {
      // Routes are as they were, so this is the label layout alone reacting to the node.
      expect(after[0]).not.toEqual(l1);
    }
    expect(overlapping(after)).toBe(false);
    const node = { x: l1.x + l1.w / 2 - 20, y: l1.y, w: 40, h: 20 };
    for (const b of after) {
      const hit =
        b.x < node.x + node.w && node.x < b.x + b.w && b.y < node.y + node.h && node.y < b.y + b.h;
      expect(hit).toBe(false);
    }
    one.dd.destroy();
    one.c.remove();
  });

  it('renders nodes with symbol markup, ports, labels and links by kind', () => {
    expect($$('.pv-node').map((n) => (n as SVGElement).dataset.nodeId)).toEqual(['a', 'b', 'c']);
    expect($('[data-node-id="a"] .pv-symbol')!.innerHTML).toContain('M0 10H40');
    expect($$('[data-node-id="a"] .pv-port').map((p) => (p as SVGElement).dataset.portId)).toEqual([
      'in',
      'out',
    ]);
    expect($('[data-node-id="a"] .pv-label')!.textContent).toBe('V-1');
    expect(($('[data-link-id="ab"]') as SVGElement).dataset.kind).toBe('process');
    expect(($('[data-link-id="bc"]') as SVGElement).dataset.kind).toBe('signal');
    const d0 = $('[data-link-id="ab"] .pv-link-line')!.getAttribute('d')!;
    expect(d0.startsWith('M40 10')).toBe(true);
    expect(d0.endsWith('200 10')).toBe(true);
    // Process links get arrows by default, signal links don't.
    expect($('[data-link-id="ab"] .pv-link-arrows')!.getAttribute('d')).not.toBe('');
    expect($('[data-link-id="bc"] .pv-link-arrows')!.getAttribute('d')).toBe('');
  });

  it('keeps labels unrotated while the body rotates', () => {
    d.update((tx) => tx.updateNode('a', { rotation: 90 }));
    d.renderer!.flush();
    expect($('[data-node-id="a"] .pv-node-body')!.getAttribute('transform')).toContain('rotate(90');
    expect($('[data-node-id="a"] .pv-label')!.getAttribute('transform')).toBeNull();
  });

  it('data ticks update symbol markup and data-status without touching links', () => {
    const line = $('[data-link-id="ab"] .pv-link-line')!;
    const setD = vi.spyOn(line, 'setAttribute');
    const symbol = $('[data-node-id="a"] .pv-symbol')!;
    const before = symbol.innerHTML;
    d.setNodeData('a', { open: false }, 'alarm');
    d.renderer!.flush();
    expect(symbol.innerHTML).not.toBe(before);
    expect(symbol.innerHTML).toContain('fill="currentColor"');
    expect(($('[data-node-id="a"]') as SVGElement).dataset.status).toBe('alarm');
    expect(setD).not.toHaveBeenCalled();
  });

  it('skips the DOM write when the rendered markup is unchanged', () => {
    const symbol = $('[data-node-id="b"] .pv-symbol')!;
    const spy = vi.spyOn(symbol, 'innerHTML', 'set');
    d.setNodeData('b', { open: true, temp: 21 });
    d.renderer!.flush();
    expect(spy).not.toHaveBeenCalled();
  });

  it('reroutes only links attached to a moved node', () => {
    const ab = $('[data-link-id="ab"] .pv-link-line')!.getAttribute('d');
    const bc = $('[data-link-id="bc"] .pv-link-line')!;
    const bcSpy = vi.spyOn(bc, 'setAttribute');
    d.update((tx) => tx.updateNode('a', { position: { x: 0, y: 60 } }));
    d.renderer!.flush();
    expect($('[data-link-id="ab"] .pv-link-line')!.getAttribute('d')).not.toBe(ab);
    expect(bcSpy).not.toHaveBeenCalled();
  });

  it('removes elements for removed items and re-adds them on undo', () => {
    d.update((tx) => tx.removeNode('b'));
    d.renderer!.flush();
    expect($('[data-node-id="b"]')).toBeNull();
    expect($('[data-link-id="ab"]')).toBeNull();
    d.undo();
    d.renderer!.flush();
    expect($('[data-node-id="b"]')).not.toBeNull();
    expect($('[data-link-id="bc"]')).not.toBeNull();
  });

  it('draws manual links through their waypoints', () => {
    d.update((tx) =>
      tx.updateLink('ab', {
        routing: 'manual',
        waypoints: [
          { x: 100, y: 10 },
          { x: 100, y: -50 },
          { x: 150, y: -50 },
          { x: 150, y: 10 },
        ],
      }),
    );
    d.renderer!.flush();
    expect($('[data-link-id="ab"] .pv-link-line')!.getAttribute('d')).toBe(
      'M40 10L100 10L100 -50L150 -50L150 10L200 10',
    );
  });

  it('exposes the routed polyline, port points included and up to date', () => {
    expect(d.getLinkPath('ab')![0]).toEqual({ x: 40, y: 10 });
    d.update((tx) => tx.updateNode('b', { position: { x: 300, y: 0 } }));
    expect(d.getLinkPath('ab')!.at(-1)).toEqual({ x: 300, y: 10 });
    expect(d.getLinkPath('nope')).toBeUndefined();
  });

  it('adds a flow path when data.flowing is set', () => {
    d.update((tx) => tx.updateLink('ab', { data: { flowing: true } }));
    d.renderer!.flush();
    expect($('[data-link-id="ab"]')!.hasAttribute('data-flowing')).toBe(true);
    expect($('[data-link-id="ab"] .pv-link-flow')).not.toBeNull();
    d.update((tx) => tx.updateLink('ab', { data: { flowing: false } }));
    d.renderer!.flush();
    expect($('[data-link-id="ab"] .pv-link-flow')).toBeNull();
  });

  it('marks selected items', () => {
    d.setSelection([
      { kind: 'node', id: 'a' },
      { kind: 'link', id: 'bc' },
    ]);
    d.renderer!.flush();
    expect($$('.pv-selected').length).toBe(2);
    d.setSelection([]);
    d.renderer!.flush();
    expect($$('.pv-selected').length).toBe(0);
  });

  it('draws a selection box behind a selected node and moves it with the node', () => {
    d.setSelection([{ kind: 'node', id: 'a' }]);
    d.renderer!.flush();
    const box = $('[data-node-id="a"] > .pv-selection-box')!;
    expect(box.getAttribute('x')).toBe('-4');
    expect(box.getAttribute('width')).toBe('48');
    expect($('[data-node-id="a"]')!.firstElementChild).toBe(box);
    d.update((tx) => tx.updateNode('a', { position: { x: 10, y: 0 } }));
    d.renderer!.flush();
    expect(box.getAttribute('x')).toBe('6');
    d.setSelection([]);
    d.renderer!.flush();
    expect($('.pv-selection-box')).toBeNull();
  });

  it('gives every node a transparent hit box under the symbol, sized to the symbol', () => {
    const body = $('[data-node-id="a"] .pv-node-body')!;
    const hit = body.firstElementChild!;
    expect(hit.getAttribute('class')).toBe('pv-node-hit');
    expect(hit.getAttribute('width')).toBe('40');
    expect(hit.getAttribute('height')).toBe('20');
    expect(d.hitTest(hit)).toEqual({ kind: 'node', id: 'a' });
  });

  it('renders unknown symbol types as a placeholder instead of failing', () => {
    d.update((tx) => tx.addNode({ id: 'x', type: 'nope/thing', position: { x: 0, y: 300 } }));
    d.renderer!.flush();
    expect($('[data-node-id="x"] .pv-missing')).not.toBeNull();
  });

  it('draws a line jump where two links cross without connecting', () => {
    d.load({
      version: 2,
      nodes: [
        { id: 'l', type: 'test/valve', position: { x: 0, y: 100 } },
        { id: 'r', type: 'test/valve', position: { x: 400, y: 100 } },
        { id: 't', type: 'test/valve', position: { x: 180, y: -100 }, rotation: 90 },
        { id: 'b', type: 'test/valve', position: { x: 180, y: 300 }, rotation: 90 },
      ],
      links: [
        {
          id: 'h',
          from: { node: 'l', port: 'out' },
          to: { node: 'r', port: 'in' },
          kind: 'process',
        },
        {
          id: 'v',
          from: { node: 't', port: 'out' },
          to: { node: 'b', port: 'in' },
          kind: 'process',
        },
      ],
    });
    d.renderer!.flush();
    const all = ['h', 'v'].map((id) =>
      $(`[data-link-id="${id}"] .pv-link-line`)!.getAttribute('d')!,
    );
    expect(all.filter((p) => p.includes('A')).length).toBe(1);

    // Deleting the crossing link alone (nothing rerouted) removes the hop.
    d.update((tx) => tx.removeLink('v'));
    d.renderer!.flush();
    expect($('[data-link-id="h"] .pv-link-line')!.getAttribute('d')).not.toContain('A');
  });

  it('keeps junction dots equal to a full analysis as links are added and deleted', () => {
    const full = () =>
      analyzeRoutes(
        [...d.store.links.keys()].map((id) => ({ linkId: id, points: d.getLinkPath(id)! })),
      ).junctions.length;
    const before = $$('.pv-junction').length;
    d.update((tx) =>
      tx.addLink({
        id: 'ac',
        from: { node: 'a', port: 'out' },
        to: { node: 'c', port: 'in' },
        kind: 'process',
      }),
    );
    d.renderer!.flush();
    // 'ab' and 'ac' share a's out port, so they branch.
    expect($$('.pv-junction').length).toBeGreaterThan(before);
    expect($$('.pv-junction').length).toBe(full());
    d.update((tx) => tx.removeLink('ac'));
    d.renderer!.flush();
    expect($$('.pv-junction').length).toBe(before);
  });

  it('skips junction dots where links merge into one port when mergeJunctions is off', () => {
    const link = (id: string, from: string, to: string) => ({
      id,
      from: { node: from, port: 'out' },
      to: { node: to, port: 'in' },
      kind: 'process' as const,
    });
    // Three sources in a row above one target: their links meet on the way into t's in port.
    const scene: DiagramModel = {
      version: 2,
      nodes: [
        { id: 's1', type: 'test/valve', position: { x: 0, y: 0 } },
        { id: 's2', type: 'test/valve', position: { x: 200, y: 0 } },
        { id: 's3', type: 'test/valve', position: { x: 400, y: 0 } },
        { id: 't', type: 'test/valve', position: { x: 600, y: 300 } },
        { id: 'u', type: 'test/valve', position: { x: 600, y: 500 } },
      ],
      links: [link('l1', 's1', 't'), link('l2', 's2', 't'), link('l3', 's3', 't')],
    };
    const run = (opts: { mergeJunctions?: boolean }) => {
      const c = document.createElement('div');
      document.body.append(c);
      const dd = new Diagram({ symbols: [valve], ...opts });
      dd.load(scene);
      dd.mount(c);
      dd.renderer!.flush();
      const junctions = () =>
        analyzeRoutes(
          [...dd.store.links.keys()].map((id) => ({ linkId: id, points: dd.getLinkPath(id)! })),
        ).junctions;
      const dots = () => c.querySelectorAll('.pv-junction').length;
      const done = () => {
        dd.destroy();
        c.remove();
      };
      return { dd, junctions, dots, done };
    };

    const on = run({});
    const merges = on.junctions();
    expect(merges.length).toBeGreaterThan(0);
    expect(on.dots()).toBe(merges.length);
    on.done();

    // The analysis is unchanged; only the dots are skipped.
    const off = run({ mergeJunctions: false });
    expect(off.junctions()).toEqual(merges);
    expect(off.dots()).toBe(0);

    // A real branch: a link to another target runs through one of the merge points, so the links
    // meeting there no longer share an end. That point keeps its dot; the pure merges still have none.
    const at = merges[0]!.point;
    off.dd.update((tx) =>
      tx.addLink({
        ...link('l4', 's1', 'u'),
        routing: 'manual',
        waypoints: [
          { x: 100, y: 10 },
          { x: 100, y: at.y - 110 },
          { x: at.x, y: at.y - 110 },
          { ...at },
          { x: at.x, y: 510 },
        ],
      }),
    );
    off.dd.renderer!.flush();
    const ends = (ids: string[], side: 'from' | 'to') =>
      new Set(
        ids.map((id) => {
          const l = off.dd.store.links.get(id)!;
          return l[side].node + '/' + l[side].port;
        }),
      ).size;
    const real = off
      .junctions()
      .filter((j) => ends(j.linkIds, 'from') > 1 && ends(j.linkIds, 'to') > 1);
    expect(real.some((j) => j.point.x === at.x && j.point.y === at.y)).toBe(true);
    expect(off.dots()).toBe(real.length);
    off.done();
  });
});

describe('NFR-1 data tick budget', () => {
  it('applies 2,000 value updates over 500 nodes in a few ms', () => {
    const nodes = Array.from({ length: 500 }, (_, i) => ({
      id: `n${i}`,
      type: 'test/valve',
      position: { x: (i % 25) * 80, y: Math.floor(i / 25) * 60 },
    }));
    d.load({ version: 2, nodes, links: [] });
    d.renderer!.flush();
    // Best of three ticks: a single sample is at the mercy of GC and of other test files running in parallel.
    let best = Infinity;
    for (let tick = 0; tick < 3; tick++) {
      const updates: Record<string, { data: Record<string, unknown>; status: string }> = {};
      for (let i = 0; i < 500; i++) {
        updates[`n${i}`] = {
          data: { open: (i + tick) % 2 === 0, a: i + tick, b: i + 1, c: i + 2 },
          status: (i + tick) % 7 ? 'normal' : 'alarm',
        };
      }
      d.setNodeDataBatch(updates);
      d.renderer!.flush();
      best = Math.min(best, d.renderer!.metrics.lastDataFlushMs);
    }
    // The PRD target is 4 ms in a real browser; happy-dom is much slower, so this only guards against regressions.
    expect(best).toBeLessThan(60);
  });
});
