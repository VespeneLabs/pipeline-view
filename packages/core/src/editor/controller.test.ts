import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Diagram } from '../diagram/diagram';
import type { SymbolDef } from '../symbols/types';
import { attachEditor, getEditor } from './controller';

const valve: SymbolDef = {
  type: 'test/valve',
  name: 'Valve',
  category: 'Valves',
  size: { width: 40, height: 20 },
  ports: [
    { id: 'in', position: { x: 0, y: 10 }, direction: 'left' },
    { id: 'out', position: { x: 40, y: 10 }, direction: 'right' },
    { id: 'sig', position: { x: 20, y: 0 }, direction: 'top', accepts: ['signal'] },
  ],
};

let container: HTMLDivElement;
let d: Diagram;
let detach: () => void;

/** Stand-in for the renderer: node groups with port circles, and link paths, carrying data-* ids. */
function renderStub() {
  const { nodes, links } = d.view!.layers;
  nodes.replaceChildren();
  links.replaceChildren();
  for (const n of d.store.nodes.values()) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('data-node-id', n.id);
    for (const p of valve.ports) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('data-port-id', p.id);
      g.append(c);
    }
    nodes.append(g);
  }
  for (const l of d.store.links.values()) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('data-link-id', l.id);
    links.append(path);
  }
}

const q = (sel: string) => d.view!.root.querySelector(sel)!;

function pointer(type: string, target: Element, x: number, y: number, init: PointerEventInit = {}) {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      clientX: x,
      clientY: y,
      ...init,
    }),
  );
}

function drag(
  target: Element,
  from: [number, number],
  to: [number, number],
  init: PointerEventInit = {},
) {
  pointer('pointerdown', target, ...from, init);
  pointer('pointermove', d.view!.root, (from[0] + to[0]) / 2, (from[1] + to[1]) / 2, init);
  pointer('pointermove', d.view!.root, ...to, init);
  pointer('pointerup', d.view!.root, ...to, init);
}

const key = (k: string, init: KeyboardEventInit = {}, target: Element = d.view!.root) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...init }));

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  d = new Diagram({ symbols: [valve], mode: 'edit' });
  d.load({
    version: 1,
    nodes: [
      { id: 'a', type: 'test/valve', position: { x: 0, y: 0 } },
      { id: 'b', type: 'test/valve', position: { x: 200, y: 100 } },
    ],
    links: [
      {
        id: 'm',
        from: { node: 'a', port: 'out' },
        to: { node: 'b', port: 'in' },
        kind: 'process',
        routing: 'manual',
        waypoints: [
          { x: 100, y: 10 },
          { x: 100, y: 110 },
        ],
      },
    ],
  });
  d.mount(container);
  renderStub();
  d.internal.on('model', renderStub);
  detach = attachEditor(d);
});

afterEach(() => {
  detach();
  d.destroy();
  container.remove();
});

describe('EditorController', () => {
  it('drags a node as one undo step', () => {
    drag(q('[data-node-id="a"]'), [10, 10], [33, 10], {});
    expect(d.store.nodes.get('a')!.position).toEqual({ x: 23, y: 0 });
    expect(d.getSelection()).toEqual([{ kind: 'node', id: 'a' }]);
    key('z', { ctrlKey: true });
    expect(d.store.nodes.get('a')!.position).toEqual({ x: 0, y: 0 });
    expect(d.canUndo()).toBe(false);
  });

  it('selects with click, shift-click and marquee, and clears on background click', () => {
    pointer('pointerdown', q('[data-node-id="a"]'), 5, 5);
    pointer('pointerup', d.view!.root, 5, 5);
    pointer('pointerdown', q('[data-link-id="m"]'), 5, 5, { shiftKey: true });
    pointer('pointerup', d.view!.root, 5, 5);
    expect(d.getSelection()).toEqual([
      { kind: 'node', id: 'a' },
      { kind: 'link', id: 'm' },
    ]);
    pointer('pointerdown', d.view!.svg, 500, 500);
    pointer('pointerup', d.view!.root, 500, 500);
    expect(d.getSelection()).toEqual([]);
    drag(d.view!.svg, [-10, -10], [260, 130]);
    expect(d.getSelection()).toEqual([
      { kind: 'node', id: 'a' },
      { kind: 'node', id: 'b' },
    ]);
  });

  it('connects port to port with compatible-port highlighting', () => {
    const from = q('[data-node-id="b"] [data-port-id="out"]');
    pointer('pointerdown', from, 240, 110);
    pointer('pointermove', d.view!.root, 10, 20);
    // The compatible ports are highlighted; the nearest one is hot.
    expect(d.view!.layers.interaction.querySelectorAll('.pv-port-target').length).toBeGreaterThan(
      0,
    );
    expect(q('.pv-port-target.pv-hot').getAttribute('data-target-port')).toBe('in');
    pointer('pointerup', d.view!.root, 3, 12);
    const link = [...d.store.links.values()].find((l) => l.id !== 'm')!;
    expect(link).toMatchObject({ from: { node: 'b', port: 'out' }, to: { node: 'a', port: 'in' } });
    expect(d.view!.layers.interaction.querySelector('.pv-connect-preview')).toBeNull();
  });

  it('does not connect when released away from any port', () => {
    pointer('pointerdown', q('[data-node-id="b"] [data-port-id="out"]'), 240, 110);
    pointer('pointerup', d.view!.root, 600, 600);
    expect(d.store.links.size).toBe(1);
  });

  it('rotates with the R key and the rotate handle', () => {
    d.setSelection([{ kind: 'node', id: 'a' }]);
    key('r');
    expect(d.store.nodes.get('a')!.rotation).toBe(90);
    pointer('pointerdown', q('[data-pv-handle="rotate"]'), 0, 0);
    pointer('pointerup', d.view!.root, 0, 0);
    expect(d.store.nodes.get('a')!.rotation).toBe(180);
    key('z', { metaKey: true });
    key('z', { metaKey: true });
    expect(d.store.nodes.get('a')).not.toHaveProperty('rotation');
    key('z', { metaKey: true, shiftKey: true });
    expect(d.store.nodes.get('a')!.rotation).toBe(90);
  });

  it('drags a link segment and adds or removes bends', () => {
    d.setSelection([{ kind: 'link', id: 'm' }]);
    // Segment 1 is the vertical run at x=100.
    const handle = q('[data-pv-handle="segment"][data-index="1"]');
    drag(handle, [100, 60], [140, 60]);
    expect(d.store.links.get('m')!.waypoints).toEqual([
      { x: 140, y: 10 },
      { x: 140, y: 110 },
    ]);
    expect(d.canUndo()).toBe(true);
    // Double-click segment 1 to add a bend (a jog), then double-click a new interior bend to remove it again.
    const wp = () => d.store.links.get('m')!.waypoints!;
    q('[data-pv-handle="segment"][data-index="1"]').dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true, clientX: 140, clientY: 60 }),
    );
    expect(wp().length).toBe(4);
    q('[data-pv-handle="bend"][data-index="2"]').dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true }),
    );
    expect(wp().length).toBe(2);
  });

  it('edits a label inline on double-click', () => {
    q('[data-node-id="b"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const input = d.view!.root.querySelector<HTMLInputElement>('.pv-label-editor')!;
    expect(input).not.toBeNull();
    input.value = 'PV-201';
    // Keys typed into the editor must not trigger shortcuts.
    key('Backspace', {}, input);
    expect(d.store.nodes.has('b')).toBe(true);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(d.store.nodes.get('b')!.label).toBe('PV-201');
    expect(d.view!.root.querySelector('.pv-label-editor')).toBeNull();
  });

  it('handles delete, copy/paste and duplicate from the keyboard', () => {
    d.setSelection([{ kind: 'node', id: 'a' }]);
    key('c', { ctrlKey: true });
    key('v', { ctrlKey: true });
    expect(d.store.nodes.has('a_1')).toBe(true);
    key('d', { ctrlKey: true });
    expect(d.store.nodes.has('a_2')).toBe(true);
    key('Delete');
    expect(d.store.nodes.has('a_2')).toBe(false);
    key('ArrowRight', { shiftKey: true });
  });

  it('drops palette symbols through dragover/drop', () => {
    const data = new Map<string, string>([['application/x-pipeline-view-symbol', 'test/valve']]);
    const dataTransfer = {
      types: [...data.keys()],
      getData: (t: string) => data.get(t) ?? '',
      dropEffect: 'none',
    };
    const over = new Event('dragover', { bubbles: true, cancelable: true });
    Object.assign(over, { dataTransfer });
    d.view!.root.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.assign(drop, { dataTransfer, clientX: 300, clientY: 300 });
    d.view!.root.dispatchEvent(drop);
    expect(d.store.nodes.get('valve_1')!.position).toEqual({ x: 280, y: 290 });
  });

  it('detaches in view mode', () => {
    const spy = vi.spyOn(d, 'undo');
    d.setMode('view');
    key('z', { ctrlKey: true });
    expect(spy).not.toHaveBeenCalled();
    expect(d.view!.root.classList.contains('pv-editing')).toBe(false);
    d.setMode('edit');
    key('z', { ctrlKey: true });
    expect(spy).toHaveBeenCalledOnce();
  });

  it('creates links of the chosen kind, falling back to what the start port accepts', () => {
    const ed = getEditor(d)!;
    expect(ed.getLinkKind()).toBe('process');
    ed.setLinkKind('pneumatic');
    pointer('pointerdown', q('[data-node-id="b"] [data-port-id="out"]'), 240, 110);
    pointer('pointerup', d.view!.root, 1, 11);
    const added = () => [...d.store.links.values()].filter((l) => l.id !== 'm');
    expect(added().map((l) => l.kind)).toEqual(['pneumatic']);
    // The signal port only accepts 'signal', so that wins over the chosen kind.
    pointer('pointerdown', q('[data-node-id="a"] [data-port-id="sig"]'), 20, 0);
    pointer('pointerup', d.view!.root, 220, 100);
    expect(added().map((l) => l.kind)).toEqual(['pneumatic', 'signal']);
  });

  it('reuses the port-target circles while the pointer moves', () => {
    pointer('pointerdown', q('[data-node-id="b"] [data-port-id="out"]'), 240, 110);
    pointer('pointermove', d.view!.root, 100, 100);
    const first = d.view!.layers.interaction.querySelector('.pv-port-target');
    pointer('pointermove', d.view!.root, 2, 11);
    expect(d.view!.layers.interaction.querySelector('.pv-port-target')).toBe(first);
    expect(d.view!.layers.interaction.querySelectorAll('.pv-hot').length).toBe(1);
    pointer('pointerup', d.view!.root, 2, 11);
  });

  it('keeps the label editor under its node when the view pans', () => {
    q('[data-node-id="b"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const input = d.view!.root.querySelector<HTMLInputElement>('.pv-label-editor')!;
    const left = parseFloat(input.style.left);
    d.setViewport({ x: 50 });
    expect(parseFloat(input.style.left)).toBe(left + 50);
  });

  it('exposes the attached controller only while editing', () => {
    expect(getEditor(d)).toBeDefined();
    d.setMode('view');
    expect(getEditor(d)).toBeUndefined();
  });

  it('draws only inside its own group and leaves other interaction-layer content alone', () => {
    const other = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    other.setAttribute('class', 'pv-focus-ring');
    d.view!.layers.interaction.append(other);
    d.setSelection([{ kind: 'node', id: 'a' }]);
    expect(d.view!.layers.interaction.querySelector('.pv-editor .pv-rotate-handle')).not.toBeNull();
    expect(other.isConnected).toBe(true);
    d.setMode('view');
    expect(d.view!.layers.interaction.querySelector('.pv-editor')).toBeNull();
    expect(other.isConnected).toBe(true);
  });
});
