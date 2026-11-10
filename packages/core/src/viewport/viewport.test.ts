import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Diagram } from '../diagram/diagram';
import type { SymbolDef } from '../symbols/types';

const box: SymbolDef = {
  type: 'test/box',
  name: 'Box',
  category: 'Test',
  size: { width: 100, height: 50 },
  ports: [{ id: 'in', position: { x: 0, y: 25 }, direction: 'left' }],
};

let container: HTMLDivElement;
let d: Diagram;

function pointer(type: string, init: Partial<PointerEventInit> & { target?: Element } = {}) {
  const { target = d.view!.root, ...rest } = init;
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: (rest.pointerId ?? 1) === 1,
      ...rest,
    }),
  );
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  // happy-dom does no layout; give every element an 800x600 client box.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  d = new Diagram({ symbols: [box] });
  d.load({
    version: 1,
    nodes: [
      { id: 'a', type: 'test/box', position: { x: 0, y: 0 } },
      { id: 'b', type: 'test/box', position: { x: 300, y: 150 } },
    ],
    links: [
      { id: 'l', from: { node: 'a', port: 'in' }, to: { node: 'b', port: 'in' }, kind: 'process' },
    ],
  });
});

afterEach(() => {
  d.destroy();
  container.remove();
  vi.restoreAllMocks();
});

describe('mount', () => {
  it('builds the layer skeleton and removes it on destroy', () => {
    d.mount(container);
    const root = container.querySelector('.pv-root')!;
    expect(root.getAttribute('role')).toBe('application');
    const order = [...root.querySelector('.pv-scene')!.children].map((c) => c.getAttribute('class'));
    expect(order).toEqual([
      'pv-layer-links',
      'pv-junctions',
      'pv-layer-nodes',
      'pv-layer-interaction',
    ]);
    expect(root.querySelector('.pv-overlay')).not.toBeNull();
    expect(() => d.mount(container)).toThrow(/already mounted/);
    d.destroy();
    expect(container.querySelector('.pv-root')).toBeNull();
  });

  it('reflects mode and theme on the root', () => {
    d.mount(container);
    const root = d.view!.root;
    expect(root.dataset.mode).toBe('view');
    expect(root.dataset.theme).toBeUndefined();
    d.setTheme('dark');
    d.setMode('edit');
    expect(root.dataset.theme).toBe('dark');
    expect(root.dataset.mode).toBe('edit');
    d.setTheme('auto');
    expect(root.dataset.theme).toBeUndefined();
  });

  it('is constructible without a DOM container (SSR) and defers zoomToFit until mount', () => {
    d.zoomToFit();
    expect(d.getViewport()).toEqual({ x: 0, y: 0, zoom: 1 });
    d.mount(container);
    expect(d.getViewport().zoom).not.toBe(1);
  });
});

describe('viewport API', () => {
  beforeEach(() => d.mount(container));

  it('applies the transform to scene and overlay and emits viewportChange', () => {
    const onChange = vi.fn();
    d.on('viewportChange', onChange);
    d.setViewport({ x: 10, y: 20, zoom: 2 });
    expect(d.view!.scene.getAttribute('transform')).toBe('translate(10,20) scale(2)');
    expect(d.view!.overlay.style.transform).toBe('translate(10px,20px) scale(2)');
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ viewport: { x: 10, y: 20, zoom: 2 } });
    d.setViewport({ x: 10, y: 20, zoom: 2 });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('clamps zoom to the configured limits', () => {
    d.setViewport({ zoom: 1000 });
    expect(d.getViewport().zoom).toBe(8);
  });

  it('zoomToFit centers the content bounds', () => {
    d.zoomToFit({ padding: 0 });
    // Content is 400x200 at (0,0) in an 800x600 box: zoom 2, centered.
    expect(d.getViewport()).toEqual({ x: 0, y: 100, zoom: 2 });
    expect(d.diagramToScreen({ x: 200, y: 100 })).toEqual({ x: 400, y: 300 });
    expect(d.screenToDiagram({ x: 400, y: 300 })).toEqual({ x: 200, y: 100 });
  });

  it('zoomToItem centers a node', () => {
    d.zoomToItem({ kind: 'node', id: 'b' });
    expect(d.diagramToScreen({ x: 350, y: 175 })).toEqual({ x: 400, y: 300 });
  });

  it('getBounds covers rotated nodes', () => {
    d.update((tx) => tx.updateNode('a', { rotation: 90 }));
    expect(d.getBounds()).toEqual({ x: 25, y: -25, width: 375, height: 225 });
  });
});

describe('input', () => {
  beforeEach(() => d.mount(container));

  it('pans with a primary drag in view mode, past the click threshold', () => {
    pointer('pointerdown', { clientX: 100, clientY: 100 });
    pointer('pointermove', { clientX: 102, clientY: 101 });
    expect(d.getViewport()).toMatchObject({ x: 0, y: 0 });
    pointer('pointermove', { clientX: 150, clientY: 130 });
    pointer('pointerup', { clientX: 150, clientY: 130 });
    expect(d.getViewport()).toMatchObject({ x: 50, y: 30 });
    expect(d.viewportController!.suppressClick).toBe(true);
  });

  it('does not pan on a primary drag over an item in edit mode, but does with the middle button', () => {
    d.setMode('edit');
    const item = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    item.dataset.nodeId = 'a';
    d.view!.layers.nodes.append(item);
    pointer('pointerdown', { target: item, clientX: 0, clientY: 0 });
    pointer('pointermove', { target: item, clientX: 40, clientY: 0 });
    pointer('pointerup', { target: item });
    expect(d.getViewport().x).toBe(0);
    pointer('pointerdown', { button: 1, clientX: 0, clientY: 0 });
    pointer('pointermove', { clientX: 40, clientY: 0 });
    pointer('pointerup');
    expect(d.getViewport().x).toBe(40);
  });

  it('resets suppressClick on the next primary press even if it does not pan', () => {
    pointer('pointerdown', { clientX: 0, clientY: 0 });
    pointer('pointermove', { clientX: 50, clientY: 0 });
    pointer('pointerup');
    expect(d.viewportController!.suppressClick).toBe(true);
    d.setMode('edit');
    pointer('pointerdown', { clientX: 0, clientY: 0 });
    expect(d.viewportController!.suppressClick).toBe(false);
  });

  it('drops pointers whose pointerup was missed, so the next press is not a pinch', () => {
    pointer('pointerdown', { clientX: 0, clientY: 0 });
    // pointerup happened outside the root and never arrived.
    pointer('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
    pointer('pointermove', { pointerId: 1, clientX: 160, clientY: 100 });
    expect(d.getViewport()).toMatchObject({ x: 60, zoom: 1 });
  });

  it('zooms with the wheel around the cursor', () => {
    const anchor = d.screenToDiagram({ x: 200, y: 100 });
    const e = new WheelEvent('wheel', { deltaY: -100, cancelable: true });
    // happy-dom's WheelEvent doesn't carry MouseEvent coordinates.
    Object.defineProperties(e, { clientX: { value: 200 }, clientY: { value: 100 } });
    d.view!.root.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(d.getViewport().zoom).toBeGreaterThan(1);
    const after = d.screenToDiagram({ x: 200, y: 100 });
    expect(after.x).toBeCloseTo(anchor.x);
    expect(after.y).toBeCloseTo(anchor.y);
  });

  it('pinch-zooms with two touch pointers', () => {
    const t = { pointerType: 'touch' as const };
    pointer('pointerdown', { ...t, pointerId: 1, clientX: 100, clientY: 100 });
    pointer('pointerdown', { ...t, pointerId: 2, clientX: 200, clientY: 100 });
    pointer('pointermove', { ...t, pointerId: 2, clientX: 300, clientY: 100 });
    expect(d.getViewport().zoom).toBeCloseTo(2);
    pointer('pointerup', { ...t, pointerId: 2 });
    pointer('pointerup', { ...t, pointerId: 1 });
  });
});

describe('hitTest', () => {
  it('resolves ports, nodes, links and annotations from DOM attributes', () => {
    d.mount(container);
    const ns = 'http://www.w3.org/2000/svg';
    const node = document.createElementNS(ns, 'g');
    node.dataset.nodeId = 'a';
    const shape = document.createElementNS(ns, 'path');
    const port = document.createElementNS(ns, 'circle');
    port.dataset.portId = 'in';
    node.append(shape, port);
    const link = document.createElementNS(ns, 'path');
    link.dataset.linkId = 'l';
    d.view!.layers.nodes.append(node);
    d.view!.layers.links.append(link);
    expect(d.hitTest(shape)).toEqual({ kind: 'node', id: 'a' });
    expect(d.hitTest(port)).toEqual({ kind: 'port', node: 'a', port: 'in' });
    expect(d.hitTest(link)).toEqual({ kind: 'link', id: 'l' });
    expect(d.hitTest(d.view!.svg)).toBeNull();
    expect(d.hitTest(document.body)).toBeNull();
  });
});
