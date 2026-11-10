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
    const updates: Record<string, { data: Record<string, unknown>; status: string }> = {};
    for (let i = 0; i < 500; i++) {
      updates[`n${i}`] = {
        data: { open: i % 2 === 0, a: i, b: i + 1, c: i + 2 },
        status: i % 7 ? 'normal' : 'alarm',
      };
    }
    d.setNodeDataBatch(updates);
    d.renderer!.flush();
    // The PRD target is 4 ms in a real browser; happy-dom is much slower, so this only guards against regressions.
    expect(d.renderer!.metrics.lastDataFlushMs).toBeLessThan(60);
  });
});
