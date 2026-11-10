import { afterEach, describe, expect, it } from 'vitest';
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
