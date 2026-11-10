import { afterEach, describe, expect, it, vi } from 'vitest';
import { Diagram } from '../diagram/diagram';
import type { HtmlRenderer } from '../diagram/types';
import type { DiagramModel } from '../model/types';
import type { SymbolDef } from '../symbols/types';

const card: SymbolDef = {
  type: 'app/card',
  name: 'Card',
  category: 'App',
  size: { width: 100, height: 50 },
  ports: [{ id: 'out', position: { x: 100, y: 25 }, direction: 'right' }],
};
const box: SymbolDef = {
  type: 't/box',
  name: 'Box',
  category: 'T',
  size: { width: 40, height: 20 },
  ports: [{ id: 'in', position: { x: 0, y: 10 }, direction: 'left' }],
  svg: '<rect width="40" height="20"/>',
};
const model: DiagramModel = {
  version: 2,
  nodes: [
    { id: 'c', type: 'app/card', position: { x: 0, y: 0 }, data: { v: 1 } },
    { id: 'b', type: 't/box', position: { x: 400, y: 15 } },
  ],
  links: [
    { id: 'l', from: { node: 'c', port: 'out' }, to: { node: 'b', port: 'in' }, kind: 'process' },
  ],
};

let container: HTMLDivElement | undefined;
afterEach(() => container?.remove());

const mount = (render: HtmlRenderer, sizing: 'fixed' | 'content') => {
  container = document.createElement('div');
  document.body.append(container);
  const d = new Diagram({
    symbols: [card, box],
    nodeRenderers: { 'app/card': { render, sizing } },
    fitOnLoad: 'never',
  });
  d.load(model);
  d.mount(container);
  d.renderer!.flush();
  d.overlay!.flush();
  return d;
};

describe('core nodeRenderers option (FR-45)', () => {
  it('mounts HTML into the node box (fixed sizing) and re-calls it on data ticks only for that node', () => {
    const calls: string[] = [];
    const d = mount((el, item) => {
      calls.push(item.id);
      el.textContent = `value ${String(item.data?.v)}`;
    }, 'fixed');
    const slot = container!.querySelector('.pv-overlay [data-node-id="c"]') as HTMLElement;
    expect(slot.classList.contains('pv-node-html')).toBe(true);
    expect(slot.style.width).toBe('100px');
    expect(slot.textContent).toBe('value 1');
    d.setNodeData('b', { x: 1 });
    d.setNodeData('c', { v: 2 });
    d.overlay!.flush();
    expect(calls).toEqual(['c', 'c']);
    expect(slot.textContent).toBe('value 2');
    d.destroy();
  });

  it('a measured size re-routes links and moves issue badges, without a model change', () => {
    const d = mount(() => {}, 'content');
    d.setIssues({ nodes: { c: [{ severity: 'error', message: 'x' }] } });
    d.issueLayer!.flush();
    const badge = () =>
      container!.querySelector('[data-issue-node="c"]')!.getAttribute('transform');
    expect(badge()).toBe('translate(100,0)');
    expect(d.getLinkPath('l')![0]).toEqual({ x: 100, y: 25 });
    d.setMeasuredSize('c', { width: 160, height: 60 });
    d.renderer!.flush();
    d.issueLayer!.flush();
    expect(d.getLinkPath('l')![0]).toEqual({ x: 160, y: 30 }); // the port scaled with the box
    expect(badge()).toBe('translate(160,0)');
    expect(d.canUndo()).toBe(false);
    expect(d.isDirty()).toBe(false);
    d.destroy();
  });
});

describe('live resizes and routing (FR-4 / FR-45)', () => {
  const leftPort: SymbolDef = {
    type: 'app/reading',
    name: 'Reading',
    category: 'App',
    size: { width: 100, height: 40 },
    ports: [{ id: 'in', position: { x: 0, y: 20 }, direction: 'left' }],
  };
  const src: SymbolDef = {
    ...box,
    type: 't/src',
    ports: [{ id: 'out', position: { x: 40, y: 10 }, direction: 'right' }],
  };

  it('a width change that leaves the ports in place does not re-route attached links', () => {
    container = document.createElement('div');
    document.body.append(container);
    const d = new Diagram({
      symbols: [leftPort, src],
      nodeRenderers: { 'app/reading': { render: () => {}, sizing: 'content' } },
      fitOnLoad: 'never',
    });
    d.load({
      version: 2,
      nodes: [
        { id: 's', type: 't/src', position: { x: 0, y: 10 } },
        { id: 'r', type: 'app/reading', position: { x: 300, y: 0 } },
      ],
      links: [
        {
          id: 'l',
          from: { node: 's', port: 'out' },
          to: { node: 'r', port: 'in' },
          kind: 'process',
        },
      ],
    });
    d.mount(container);
    d.renderer!.flush();
    // Count route computations (a re-route with an identical result would leave the DOM untouched).
    const router = (d.renderer as unknown as { router: { route(r: unknown[]): unknown[] } }).router;
    const route = vi.spyOn(router, 'route');

    d.setMeasuredSize('r', { width: 140, height: 40 }); // "9.64" → "12.43": wider, port unchanged
    d.renderer!.flush();
    const routed = route.mock.calls
      .flatMap((c) => c[0] as { linkId: string }[])
      .map((q) => q.linkId);
    expect(routed).not.toContain('l');

    // A width-only resize still re-routes an own link whose inner segments now come within the
    // router's clearance (12) of the node. Here the route runs 5 px above the box and 5 px left of it.
    const routes = (d.renderer as unknown as { routes: Map<string, unknown> }).routes;
    routes.set('l', [
      { x: 40, y: 20 },
      { x: 150, y: 20 },
      { x: 150, y: -5 },
      { x: 295, y: -5 },
      { x: 295, y: 20 },
      { x: 300, y: 20 },
    ]);
    route.mockClear();
    d.setMeasuredSize('r', { width: 160, height: 40 });
    d.renderer!.flush();
    expect(
      route.mock.calls.flatMap((c) => c[0] as { linkId: string }[]).map((q) => q.linkId),
    ).toContain('l');

    d.setMeasuredSize('r', { width: 140, height: 60 }); // taller: the port moves to y = 30
    d.renderer!.flush();
    expect(d.getLinkPath('l')!.at(-1)).toEqual({ x: 300, y: 30 });
    d.destroy();
  });
});
