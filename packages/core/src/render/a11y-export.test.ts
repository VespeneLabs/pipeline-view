import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Diagram } from '../diagram/diagram';
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
  svg: '<rect width="40" height="40" stroke="currentColor"/>',
};

let container: HTMLDivElement;
let d: Diagram;
const $ = (s: string) => container.querySelector(s);
const key = (k: string, init: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  (document.activeElement ?? d.view!.root).dispatchEvent(e);
  return e;
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  d = new Diagram({ symbols: [box] });
  // Grid:  a  b
  //        c
  d.load({
    version: 2,
    nodes: [
      { id: 'a', type: 'test/box', position: { x: 0, y: 0 }, label: 'Tank A' },
      { id: 'b', type: 'test/box', position: { x: 200, y: 0 }, status: 'alarm' },
      { id: 'c', type: 'test/box', position: { x: 0, y: 200 } },
    ],
    links: [
      {
        id: 'ab',
        from: { node: 'a', port: 'out' },
        to: { node: 'b', port: 'in' },
        kind: 'process',
      },
    ],
    annotations: [{ id: 't', kind: 'text', text: 'Area', position: { x: 0, y: -30 } }],
  });
  d.mount(container);
  d.renderer!.flush();
  d.overlay!.flush();
  d.view!.root.focus();
});

afterEach(() => {
  d.destroy();
  container.remove();
  vi.restoreAllMocks();
});

describe('accessibility', () => {
  it('labels nodes with label/id, symbol name and status, with a roving tabindex', () => {
    const a = $('[data-node-id="a"]')!;
    expect(a.getAttribute('role')).toBe('button');
    expect(a.getAttribute('aria-label')).toBe('Tank A, Box');
    expect($('[data-node-id="b"]')!.getAttribute('aria-label')).toBe('b, Box, alarm');
    expect(a.getAttribute('tabindex')).toBe('-1');
    d.setNodeData('b', {}, 'normal');
    d.renderer!.flush();
    expect($('[data-node-id="b"]')!.getAttribute('aria-label')).toBe('b, Box, normal');
  });

  it('moves focus with arrows in view mode, and only with Alt in edit mode', () => {
    key('ArrowRight');
    expect(d.keyboard!.getFocused()).toBe('a'); // nothing focused yet: start at the first node
    expect(document.activeElement).toBe($('[data-node-id="a"]'));
    expect($('[data-node-id="a"]')!.getAttribute('tabindex')).toBe('0');
    key('ArrowRight');
    expect(d.keyboard!.getFocused()).toBe('b');
    expect($('[data-node-id="a"]')!.getAttribute('tabindex')).toBe('-1');
    key('ArrowDown');
    expect(d.keyboard!.getFocused()).toBe('c'); // b has nothing directly below; c is the nearest downward
    d.setMode('edit');
    expect(key('ArrowUp').defaultPrevented).toBe(false);
    expect(d.keyboard!.getFocused()).toBe('c');
    key('ArrowUp', { altKey: true });
    expect(d.keyboard!.getFocused()).toBe('a');
  });

  it('Enter selects and emits nodeClick in view mode; Escape clears; End jumps', () => {
    const onClick = vi.fn();
    d.on('nodeClick', onClick);
    key('End');
    expect(d.keyboard!.getFocused()).toBe('c');
    key('Enter');
    expect(d.getSelection()).toEqual([{ kind: 'node', id: 'c' }]);
    expect(onClick.mock.calls[0]![0].item).toEqual({ kind: 'node', id: 'c' });
    key('Escape');
    expect(d.getSelection()).toEqual([]);
  });

  it('shows the focus ring around the focused node only', () => {
    key('Home');
    const ring = $('.pv-focus-ring') as SVGRectElement;
    expect(ring.style.display).toBe('');
    expect(ring.getAttribute('x')).toBe('-4');
    expect(ring.getAttribute('width')).toBe('48');
  });

  it('zooms with + / - and fits with 0, ignoring Ctrl/Cmd combos', () => {
    key('+');
    expect(d.getViewport().zoom).toBeCloseTo(1.25);
    key('-');
    expect(d.getViewport().zoom).toBeCloseTo(1);
    expect(key('+', { ctrlKey: true }).defaultPrevented).toBe(false);
  });
});

describe('export', () => {
  it('produces a standalone SVG without interaction chrome', () => {
    const svg = d.exportSVG({ padding: 10 });
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const root = doc.documentElement;
    expect(root.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg');
    // Nodes span 0..240 x 0..240 and the text annotation sits at y = -30; padded by 10.
    expect(root.getAttribute('viewBox')).toBe('-10 -40 260 290');
    expect(doc.querySelectorAll('[data-node-id]').length).toBe(3);
    expect(doc.querySelector('[data-link-id="ab"] .pv-link-line')).not.toBeNull();
    expect(
      doc.querySelector('.pv-port, .pv-link-hit, .pv-focus-ring, .pv-layer-interaction'),
    ).toBeNull();
    expect(doc.querySelector('[tabindex]')).toBeNull();
    expect(doc.querySelector('text.pv-annotation')!.textContent).toBe('Area');
  });

  it('can export only the visible viewport', () => {
    d.setViewport({ x: 100, y: 50, zoom: 2 });
    const root = new DOMParser().parseFromString(
      d.exportSVG({ viewportOnly: true }),
      'image/svg+xml',
    ).documentElement;
    expect(root.getAttribute('viewBox')).toBe('-50 -25 400 300');
  });

  it('refuses before mount', async () => {
    const fresh = new Diagram();
    expect(() => fresh.exportSVG()).toThrow(/mounted/);
    await expect(fresh.exportPNG()).rejects.toThrow(/mounted/);
  });
});
