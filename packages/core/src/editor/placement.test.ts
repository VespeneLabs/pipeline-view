import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Diagram } from '../diagram/diagram';
import type { DiagramOptions } from '../diagram/types';
import type { SymbolDef } from '../symbols/types';
import { attachEditor, getEditor } from './controller';

const valve: SymbolDef = {
  type: 'test/valve',
  name: 'Valve',
  category: 'Test',
  size: { width: 40, height: 20 },
  ports: [
    { id: 'in', position: { x: 0, y: 10 }, direction: 'left', role: 'in' },
    { id: 'out', position: { x: 40, y: 10 }, direction: 'right', role: 'out' },
  ],
  svg: '<path d="M0 10H40"/>',
};

let container: HTMLDivElement;
let d: Diagram;
let detach: () => void;

function setup(options: DiagramOptions = {}) {
  container = document.createElement('div');
  document.body.append(container);
  d = new Diagram({ symbols: [valve], mode: 'edit', ...options });
  d.load({
    version: 2,
    nodes: [{ id: 'v', type: 'test/valve', position: { x: 0, y: 0 } }],
    links: [],
  });
  d.mount(container);
  detach = attachEditor(d);
}

const root = () => d.view!.root;
const ghost = () => root().querySelector<SVGGElement>('.pv-editor .pv-placement');
const pointer = (type: string, x: number, y: number, pointerType = 'mouse') =>
  root().dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      button: 0,
      pointerId: 1,
      pointerType,
      clientX: x,
      clientY: y,
    }),
  );
const key = (k: string) =>
  root().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

afterEach(() => {
  detach();
  d.destroy();
  container.remove();
});

describe('acceptDrop (FR-50)', () => {
  const MIME = 'application/x-host-symbol';
  const dropEvent = (type: string, data: Record<string, string>, x: number, y: number) => {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(e, {
      clientX: x,
      clientY: y,
      dataTransfer: {
        types: Object.keys(data),
        getData: (k: string) => data[k] ?? '',
        dropEffect: 'none',
      },
    });
    root().dispatchEvent(e);
    return e;
  };

  beforeEach(() =>
    setup({ canDrop: (_t, p) => (p.x < 0 ? { ok: false, reason: 'off sheet' } : true) }),
  );

  it('builds the node with the host callback, checks canDrop and de-duplicates ids', () => {
    const toNode = vi.fn((dt: DataTransfer, p: { x: number; y: number }) => ({
      id: 'v',
      type: dt.getData(MIME),
      position: p,
      label: 'From host',
    }));
    const off = d.acceptDrop({ mimeType: MIME, toNode });
    expect(dropEvent('dragover', { [MIME]: 'test/valve' }, 0, 0).defaultPrevented).toBe(true);
    dropEvent('drop', { [MIME]: 'test/valve' }, 120, 80);
    expect(toNode).toHaveBeenCalledOnce();
    expect(d.store.nodes.get('v_1')).toMatchObject({
      position: { x: 120, y: 80 },
      label: 'From host',
    });
    expect(d.getSelection()).toEqual([{ kind: 'node', id: 'v_1' }]);

    dropEvent('drop', { [MIME]: 'test/valve' }, -50, 0); // refused by canDrop
    expect(d.store.nodes.size).toBe(2);

    off();
    expect(dropEvent('dragover', { [MIME]: 'test/valve' }, 0, 0).defaultPrevented).toBe(false);
  });
});

describe('startPlacement (FR-50)', () => {
  beforeEach(() =>
    setup({ canDrop: (_t, p) => (p.x < 0 ? { ok: false, reason: 'Off the sheet' } : true) }),
  );

  it('shows a preview that follows the pointer and places it on click', () => {
    d.startPlacement('test/valve', { label: 'New' });
    expect(getEditor(d)!.isPlacing()).toBe(true);
    expect(ghost()).not.toBeNull();
    pointer('pointermove', 220, 110);
    expect(ghost()!.getAttribute('transform')).toBe('translate(200,100)');
    pointer('pointerdown', 220, 110);
    expect(d.store.nodes.get('valve_1')).toMatchObject({
      position: { x: 200, y: 100 },
      label: 'New',
    });
    expect(ghost()).toBeNull();
    expect(d.canUndo()).toBe(true);
  });

  it('marks a refused spot, shows why, and stays in placement until a valid click', () => {
    d.startPlacement('test/valve');
    pointer('pointermove', -100, 50);
    expect(ghost()!.getAttribute('data-refused')).toBe('refused');
    expect(root().querySelector('.pv-editor .pv-refusal-tip')!.textContent).toBe('Off the sheet');
    pointer('pointerdown', -100, 50);
    expect(d.store.nodes.size).toBe(1);
    expect(getEditor(d)!.isPlacing()).toBe(true);
    key('Escape');
    expect(getEditor(d)!.isPlacing()).toBe(false);
    expect(d.store.nodes.size).toBe(1);
  });

  it('works from the keyboard: arrows nudge, Enter places', () => {
    d.startPlacement('test/valve');
    key('ArrowRight');
    key('ArrowRight');
    key('ArrowDown');
    key('Enter');
    // The centre starts at the view centre (0,0 in happy-dom) and moves 2 steps right and 1 down
    // (grid default 10) to (20,10), so the 40x20 valve's top-left lands at (0,0).
    expect(d.store.nodes.get('valve_1')!.position).toEqual({ x: 0, y: 0 });
  });

  it('places where a touch lifts', () => {
    d.startPlacement('test/valve');
    pointer('pointerdown', 100, 100, 'touch');
    pointer('pointermove', 150, 120, 'touch');
    expect(d.store.nodes.size).toBe(1);
    pointer('pointerup', 150, 120, 'touch');
    expect(d.store.nodes.get('valve_1')!.position).toEqual({ x: 130, y: 110 });
  });
});

describe('diagram.connect (FR-54)', () => {
  it('validates and connects headlessly, in flow order, as one undo step', () => {
    const h = new Diagram({ symbols: [valve], noSelfLoops: true });
    h.load({
      version: 2,
      nodes: [
        { id: 'a', type: 'test/valve', position: { x: 0, y: 0 } },
        { id: 'b', type: 'test/valve', position: { x: 100, y: 0 } },
      ],
      links: [],
    });
    expect(h.connect({ node: 'b', port: 'in' }, { node: 'a', port: 'out' })).toEqual({
      ok: true,
      id: 'process_1',
    });
    expect(h.store.links.get('process_1')).toMatchObject({
      from: { node: 'a', port: 'out' },
      to: { node: 'b', port: 'in' },
    });
    expect(h.connect({ node: 'a', port: 'out' }, { node: 'a', port: 'in' })).toMatchObject({
      ok: false,
      code: 'self-loop',
      reason: 'A node cannot connect to itself.',
    });
    h.undo();
    expect(h.store.links.size).toBe(0);
  });
});
