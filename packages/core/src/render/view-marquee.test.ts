import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Diagram } from '../diagram/diagram';
import type { DiagramOptions } from '../diagram/types';
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

function setup(options: DiagramOptions = {}): void {
  d = new Diagram({ symbols: [box], fitOnLoad: 'never', ...options });
  d.load({
    version: 2,
    nodes: [
      { id: 'a', type: 'test/box', position: { x: 100, y: 100 } },
      { id: 'b', type: 'test/box', position: { x: 300, y: 100 } },
      { id: 'c', type: 'test/box', position: { x: 300, y: 400 } },
    ],
    links: [],
  });
  d.mount(container);
  d.renderer!.flush();
}

function pointer(type: string, init: PointerEventInit & { target?: Element } = {}): void {
  const { target = d.view!.svg, ...rest } = init;
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      ...rest,
    }),
  );
}

/** Drags on the background from one client point to another, then sends the click a browser would. */
function drag(from: [number, number], to: [number, number], init: PointerEventInit = {}): void {
  pointer('pointerdown', { ...init, clientX: from[0], clientY: from[1] });
  pointer('pointermove', {
    ...init,
    clientX: (from[0] + to[0]) / 2,
    clientY: (from[1] + to[1]) / 2,
  });
  pointer('pointermove', { ...init, clientX: to[0], clientY: to[1] });
  pointer('pointerup', { ...init, clientX: to[0], clientY: to[1] });
  d.view!.svg.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

const ids = () =>
  d
    .getSelection()
    .map((i) => i.id)
    .sort();
const box$ = () => d.view!.root.querySelector('.pv-marquee');

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
});

afterEach(() => {
  d.destroy();
  container.remove();
  vi.restoreAllMocks();
});

describe('selection box in view mode (primaryDrag)', () => {
  it('selects the nodes the box touches and keeps the selection after the closing click', () => {
    setup();
    drag([50, 50], [450, 200]);
    expect(ids()).toEqual(['a', 'b']);
    expect(d.getViewport()).toMatchObject({ x: 0, y: 0 });
    expect(box$()).toBeNull();
  });

  it('draws the box in diagram coordinates while dragging', () => {
    setup({ initialViewport: { x: 0, y: 0, zoom: 2 } });
    pointer('pointerdown', { clientX: 100, clientY: 100 });
    pointer('pointermove', { clientX: 102, clientY: 101 });
    expect(box$()).toBeNull(); // still a click
    pointer('pointermove', { clientX: 300, clientY: 60 });
    const r = box$()!;
    expect(['x', 'y', 'width', 'height'].map((k) => r.getAttribute(k))).toEqual([
      '50',
      '30',
      '100',
      '20',
    ]);
    expect(r.getAttribute('stroke-width')).toBe('0.5');
    pointer('pointercancel', { clientX: 300, clientY: 60 });
    expect(box$()).toBeNull();
    expect(ids()).toEqual([]);
  });

  it('adds to the selection with Shift, and replaces it without', () => {
    setup();
    d.setSelection([{ kind: 'node', id: 'c' }]);
    drag([50, 50], [250, 200], { shiftKey: true });
    expect(ids()).toEqual(['a', 'c']);
    drag([250, 50], [450, 200], { shiftKey: true });
    expect(ids()).toEqual(['a', 'b', 'c']);
    drag([250, 50], [450, 200]);
    expect(ids()).toEqual(['b']);
  });

  it('leaves a press that does not move to the click, which clears the selection', () => {
    setup();
    d.setSelection([{ kind: 'node', id: 'a' }]);
    drag([50, 50], [51, 51]);
    expect(ids()).toEqual([]);
  });

  it('does not start on an item, with touch, with Space held, or in edit mode', () => {
    setup();
    const node = d.view!.root.querySelector('[data-node-id="a"]')!;
    pointer('pointerdown', { target: node, clientX: 120, clientY: 120 });
    pointer('pointermove', { target: node, clientX: 400, clientY: 300 });
    expect(box$()).toBeNull();
    pointer('pointerup', { target: node, clientX: 400, clientY: 300 });

    pointer('pointerdown', { pointerType: 'touch', clientX: 50, clientY: 50 });
    pointer('pointermove', { pointerType: 'touch', clientX: 400, clientY: 300 });
    expect(box$()).toBeNull();
    pointer('pointerup', { pointerType: 'touch', clientX: 400, clientY: 300 });
    d.setViewport({ x: 0, y: 0 });

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    pointer('pointerdown', { clientX: 50, clientY: 50 });
    pointer('pointermove', { clientX: 400, clientY: 300 });
    expect(box$()).toBeNull();
    pointer('pointerup', { clientX: 400, clientY: 300 });
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    d.setViewport({ x: 0, y: 0 });

    d.setMode('edit');
    drag([50, 50], [450, 200]);
    expect(ids()).toEqual([]);
  });

  it("is off with primaryDrag: 'pan': the drag moves the viewport", () => {
    setup({ primaryDrag: 'pan' });
    drag([50, 50], [450, 200]);
    expect(ids()).toEqual([]);
    expect(d.getViewport()).toMatchObject({ x: 400, y: 150 });
  });
});

describe('context menu with right-button panning', () => {
  const menu = (init: MouseEventInit = {}) => {
    const e = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
      ...init,
    });
    d.view!.svg.dispatchEvent(e);
    return e;
  };

  it('raises contextMenu on the release when the menu event came with the press (macOS, Linux)', () => {
    setup();
    const onMenu = vi.fn();
    d.on('contextMenu', onMenu);
    pointer('pointerdown', { button: 2, clientX: 50, clientY: 50 });
    const e = menu({ buttons: 2, clientX: 50, clientY: 50 });
    expect(e.defaultPrevented).toBe(true);
    expect(onMenu).not.toHaveBeenCalled();
    pointer('pointerup', { button: 2, clientX: 50, clientY: 50 });
    expect(onMenu).toHaveBeenCalledTimes(1);
    expect(onMenu.mock.calls[0]![0].originalEvent).toBe(e);
  });

  it('raises nothing when the right press panned, whichever order the events come in', () => {
    setup();
    const onMenu = vi.fn();
    d.on('contextMenu', onMenu);
    // macOS, Linux: the menu event comes with the press.
    pointer('pointerdown', { button: 2, clientX: 50, clientY: 50 });
    menu({ buttons: 2 });
    pointer('pointermove', { buttons: 2, clientX: 90, clientY: 50 });
    pointer('pointerup', { button: 2, clientX: 90, clientY: 50 });
    // Windows: it comes after the release.
    pointer('pointerdown', { button: 2, clientX: 50, clientY: 50 });
    pointer('pointermove', { buttons: 2, clientX: 90, clientY: 50 });
    pointer('pointerup', { button: 2, clientX: 90, clientY: 50 });
    expect(menu().defaultPrevented).toBe(true);
    expect(d.getViewport().x).toBe(80);
    expect(onMenu).not.toHaveBeenCalled();
  });

  it('raises contextMenu at once after a right click that did not move (Windows)', () => {
    setup();
    const onMenu = vi.fn();
    d.on('contextMenu', onMenu);
    pointer('pointerdown', { button: 2, clientX: 50, clientY: 50 });
    pointer('pointerup', { button: 2, clientX: 50, clientY: 50 });
    expect(menu().defaultPrevented).toBe(true);
    expect(onMenu).toHaveBeenCalledTimes(1);
  });

  it('leaves keyboard menus and a locked viewport to the browser', () => {
    setup();
    const onMenu = vi.fn();
    d.on('contextMenu', onMenu);
    expect(menu({ button: 0 }).defaultPrevented).toBe(false);
    d.lockViewport(true);
    expect(menu({ buttons: 2 }).defaultPrevented).toBe(false);
    expect(onMenu).toHaveBeenCalledTimes(2);
  });
});
