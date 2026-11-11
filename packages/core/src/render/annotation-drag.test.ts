import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Diagram } from '../diagram/diagram';
import type { DiagramEvents, DiagramOptions, HtmlRenderer } from '../diagram/types';
import type { SymbolDef } from '../symbols/types';
import { attachEditor } from '../editor/controller';

const box: SymbolDef = {
  type: 'test/box',
  name: 'Box',
  category: 'Test',
  size: { width: 100, height: 50 },
  ports: [{ id: 'in', position: { x: 0, y: 25 }, direction: 'left' }],
  svg: '<rect width="100" height="50"/>',
};

let container: HTMLDivElement;
let d: Diagram;
let card: ReturnType<typeof vi.fn<HtmlRenderer>>;
let cleanup: ReturnType<typeof vi.fn>;
let moves: DiagramEvents['annotationMove'][];
let changes: DiagramEvents['modelChange'][];
let clicks: number;

const $ = <T extends Element = HTMLElement>(s: string) => container.querySelector<T>(s)!;
const reading = () => $('.pv-overlay [data-annotation-id="reading"]');
const title = () => $<SVGTextElement>('[data-annotation-id="title"]');
/** jsdom and happy-dom serialize transforms differently. */
const at = (el: HTMLElement) => el.style.transform.replace(/\s/g, '');
const flush = () => {
  d.renderer!.flush();
  d.overlay!.flush();
};

function setup(options: DiagramOptions = {}): void {
  d = new Diagram({ symbols: [box], htmlRenderers: { card }, fitOnLoad: 'never', ...options });
  d.load({
    version: 2,
    nodes: [{ id: 'tank', type: 'test/box', position: { x: 100, y: 100 }, label: 'Tank 1' }],
    links: [],
    annotations: [
      { id: 'title', kind: 'text', text: 'Area 1', position: { x: 10, y: 20 } },
      {
        id: 'reading',
        kind: 'html',
        renderer: 'card',
        position: { x: 0, y: -80 },
        size: { width: 100, height: 40 },
        anchor: { node: 'tank' },
        leader: true,
      },
      { id: 'fixed', kind: 'text', text: 'Fixed', position: { x: 300, y: 300 }, draggable: false },
    ],
  });
  d.mount(container);
  d.on('annotationMove', (e) => moves.push(e));
  d.on('modelChange', (e) => changes.push(e));
  d.on('nodeClick', () => clicks++);
  flush();
}

function pointer(type: string, target: Element, x: number, y: number, init: PointerEventInit = {}) {
  const e = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
    pointerId: 1,
    isPrimary: true,
    ...init,
  });
  target.dispatchEvent(e);
  return e;
}

/** Press, move by (dx, dy) screen pixels and release, with the click the browser would send. */
function drag(target: Element, dx: number, dy: number, release = true): void {
  pointer('pointerdown', target, 50, 50);
  pointer('pointermove', target, 50 + dx / 2, 50 + dy / 2);
  pointer('pointermove', target, 50 + dx, 50 + dy);
  if (!release) return;
  pointer('pointerup', target, 50 + dx, 50 + dy);
  target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

const key = (target: Element, k: string, init: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
};

const modelPos = (id: string) => d.toJSON().annotations!.find((a) => a.id === id)!.position;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  cleanup = vi.fn();
  card = vi.fn<HtmlRenderer>((el, item) => {
    el.textContent = item.id;
    return cleanup as () => void;
  });
  moves = [];
  changes = [];
  clicks = 0;
});

afterEach(() => {
  d.destroy();
  container.remove();
});

describe('annotation drag: opt-in', () => {
  it('is off by default: no draggable slots, and the press pans as before', () => {
    setup();
    expect(reading().hasAttribute('data-draggable')).toBe(false);
    expect(reading().hasAttribute('tabindex')).toBe(false);
    drag(reading(), 40, 0);
    expect(moves).toEqual([]);
    expect(d.getViewport().x).toBe(40);
    expect(d.getAnnotationPosition('reading')).toEqual({ x: 0, y: -80 });
  });

  it("'edit' follows the mode, 'always' covers view mode, and `draggable` overrides both", () => {
    setup({ annotationDrag: 'edit' });
    expect(d.isAnnotationDraggable('reading')).toBe(false);
    d.setMode('edit');
    flush();
    expect(d.isAnnotationDraggable('reading')).toBe(true);
    expect(reading().hasAttribute('data-draggable')).toBe(true);
    expect(d.isAnnotationDraggable('fixed')).toBe(false);
    d.setMode('view');
    flush();
    expect(reading().hasAttribute('data-draggable')).toBe(false);
    d.setAnnotationDrag('always');
    flush();
    expect(reading().hasAttribute('data-draggable')).toBe(true);
    expect($('[data-annotation-id="fixed"]').hasAttribute('data-draggable')).toBe(false);
    d.setAnnotationDrag(false);
    d.update((tx) => tx.updateAnnotation('title', { draggable: true }));
    flush();
    expect(title().hasAttribute('data-draggable')).toBe(true);
    expect(reading().hasAttribute('data-draggable')).toBe(false);
  });

  it('makes draggable annotations focusable and named', () => {
    setup({ annotationDrag: 'always' });
    for (const el of [reading(), title()]) {
      expect(el.getAttribute('tabindex')).toBe('0');
      expect(el.getAttribute('role')).toBe('group');
      expect(el.getAttribute('aria-roledescription')).toBe('movable annotation');
    }
    expect(title().getAttribute('aria-label')).toBe('Area 1');
    expect(reading().getAttribute('aria-label')).toBe('Tank 1'); // an HTML card is named by its node
  });
});

describe("annotation drag in view mode, annotationMoves: 'model'", () => {
  beforeEach(() => setup({ annotationDrag: 'always' }));

  it('follows the pointer live without a transaction, then commits one undoable step', () => {
    const el = reading();
    const leader = $<SVGPathElement>('.pv-leader').getAttribute('d');
    drag(el, 30, 12, false);
    flush();
    // Live: placed at anchor (100,100) + (0,-80) + (30,12); the model hasn't changed yet.
    expect(at(el)).toBe('translate(130px,32px)');
    expect($<SVGPathElement>('.pv-leader').getAttribute('d')).not.toBe(leader);
    expect(container.querySelector('.pv-annotation-dragging')).not.toBeNull();
    expect(d.getAnnotationPosition('reading')).toEqual({ x: 30, y: -68 });
    expect(modelPos('reading')).toEqual({ x: 0, y: -80 });
    expect(changes).toHaveLength(0);
    expect(d.canUndo()).toBe(false);
    expect(d.isDirty()).toBe(false);
    expect(moves.at(-1)).toEqual({ id: 'reading', position: { x: 30, y: -68 }, final: false });

    pointer('pointerup', el, 80, 62);
    flush();
    expect(moves.at(-1)).toEqual({ id: 'reading', position: { x: 30, y: -68 }, final: true });
    expect(moves.filter((m) => m.final)).toHaveLength(1);
    expect(modelPos('reading')).toEqual({ x: 30, y: -68 }); // still relative to its anchor
    expect(changes).toHaveLength(1);
    expect(changes[0]!.origin).toBe('user');
    expect(changes[0]!.diff.changed.annotations).toEqual(['reading']);
    expect(d.isDirty()).toBe(true);
    expect(container.querySelector('.pv-annotation-dragging')).toBeNull();
    expect(reading()).toBe(el); // same slot: the renderer stays mounted
    expect(cleanup).not.toHaveBeenCalled();

    d.undo();
    flush();
    expect(modelPos('reading')).toEqual({ x: 0, y: -80 });
    expect(at(el)).toBe('translate(100px,20px)');
  });

  it("doesn't pan, select or emit clicks", () => {
    const vp = d.getViewport();
    const selection = vi.fn();
    d.on('selectionChange', selection);
    drag(reading(), 30, 0);
    expect(d.getViewport()).toEqual(vp);
    expect(selection).not.toHaveBeenCalled();
    expect(clicks).toBe(0);
  });

  it('keeps a press below the threshold a click, which selects', () => {
    const el = reading();
    pointer('pointerdown', el, 50, 50);
    pointer('pointermove', el, 52, 51);
    pointer('pointerup', el, 52, 51);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(moves).toEqual([]);
    expect(changes).toHaveLength(0);
    expect(d.getSelection()).toEqual([{ kind: 'annotation', id: 'reading' }]);
  });

  it('moves in diagram units at any zoom, and drags text annotations too', () => {
    d.setViewport({ zoom: 2 });
    drag(title(), 40, -20);
    expect(modelPos('title')).toEqual({ x: 30, y: 10 });
    flush();
    expect(title().getAttribute('x')).toBe('30');
  });

  it('leaves annotations with draggable: false alone', () => {
    drag($('[data-annotation-id="fixed"]'), 40, 0);
    expect(moves).toEqual([]);
    expect(modelPos('fixed')).toEqual({ x: 300, y: 300 });
  });

  it('reverts on pointercancel and on a second pointer', () => {
    const el = reading();
    drag(el, 30, 0, false);
    pointer('pointercancel', el, 80, 50);
    expect(moves.at(-1)).toEqual({ id: 'reading', position: { x: 0, y: -80 }, final: true });
    expect(d.getAnnotationPosition('reading')).toEqual({ x: 0, y: -80 });
    drag(el, 30, 0, false);
    pointer('pointerdown', el, 90, 90, { pointerId: 2, isPrimary: false });
    expect(d.getAnnotationPosition('reading')).toEqual({ x: 0, y: -80 });
    expect(changes).toHaveLength(0);
  });

  it('reports where the annotation really is when beforeChange vetoes the commit', () => {
    d.options.beforeChange = () => false;
    drag(reading(), 30, 0);
    expect(moves.at(-1)).toEqual({ id: 'reading', position: { x: 0, y: -80 }, final: true });
    expect(d.getAnnotationPosition('reading')).toEqual({ x: 0, y: -80 });
  });

  it("doesn't start from a card's own inputs or [data-pv-no-drag]", () => {
    const input = document.createElement('input');
    reading().append(input);
    drag(input, 30, 0);
    expect(moves).toEqual([]);
    expect(d.getViewport().x).toBe(0); // and the press doesn't pan either
  });

  it('snaps the absolute position to the grid when grid snap is on', () => {
    d.options.grid = { size: 20, snap: true, visible: false };
    drag(reading(), 33, 7);
    // Absolute (100+33, 20+7) → (140, 20); relative to the anchor at (100,100) → (40,-80).
    expect(modelPos('reading')).toEqual({ x: 40, y: -80 });
  });
});

describe("annotationMoves: 'display'", () => {
  beforeEach(() => setup({ annotationDrag: 'always', annotationMoves: 'display' }));

  it('keeps the move out of the model, undo, dirty state and toJSON', () => {
    const before = JSON.stringify(d.toJSON());
    const el = reading();
    drag(el, 30, 12);
    flush();
    expect(moves.at(-1)).toEqual({ id: 'reading', position: { x: 30, y: -68 }, final: true });
    expect(at(el)).toBe('translate(130px,32px)');
    expect(d.getAnnotationPosition('reading')).toEqual({ x: 30, y: -68 });
    expect(JSON.stringify(d.toJSON())).toBe(before);
    expect(changes).toHaveLength(0);
    expect(d.canUndo()).toBe(false);
    expect(d.isDirty()).toBe(false);
    expect(d.itemBounds({ kind: 'annotation', id: 'reading' })).toMatchObject({ x: 130, y: 32 });
    expect(cleanup).not.toHaveBeenCalled();
    // A second drag continues from the display position.
    drag(el, 10, 0);
    expect(d.getAnnotationPosition('reading')).toEqual({ x: 40, y: -68 });
  });

  it('follows the anchor node: the display position stays relative to it', () => {
    drag(reading(), 30, 12);
    d.update((tx) => tx.updateNode('tank', { position: { x: 200, y: 150 } }));
    flush();
    expect(at(reading())).toBe('translate(230px,82px)');
  });

  it('restores and resets positions with setAnnotationPositions', () => {
    d.setAnnotationPositions({ reading: { x: 50, y: 60 }, title: { x: 5, y: 6 } });
    flush();
    expect(at(reading())).toBe('translate(150px,160px)');
    expect(title().getAttribute('x')).toBe('5');
    expect(d.getBounds().height).toBeGreaterThanOrEqual(60);
    expect(d.isDirty()).toBe(false);
    expect(moves).toEqual([]); // programmatic: no annotationMove
    // Leaving an id out puts that annotation back.
    d.setAnnotationPositions({ title: { x: 5, y: 6 } });
    flush();
    expect(at(reading())).toBe('translate(100px,20px)');
    expect(d.getAnnotationPosition('reading')).toEqual({ x: 0, y: -80 });
    d.setAnnotationPositions(null);
    flush();
    expect(title().getAttribute('x')).toBe('10');
    expect(d.getAnnotationPosition('nope')).toBeUndefined();
  });

  it('goes back to the earlier display position when a drag is cancelled', () => {
    d.setAnnotationPositions({ reading: { x: 50, y: 60 } });
    drag(reading(), 30, 0, false);
    pointer('pointercancel', reading(), 80, 50);
    expect(d.getAnnotationPosition('reading')).toEqual({ x: 50, y: 60 });
  });
});

describe('annotation drag: keyboard', () => {
  const live = () => $('.pv-live').textContent;

  it('moves with the arrow keys and commits on Enter, announcing the position', () => {
    setup({ annotationDrag: 'always' });
    const el = reading();
    el.focus();
    const e = key(el, 'ArrowRight');
    expect(e.defaultPrevented).toBe(true);
    expect(live()).toBe('1, -80'); // a step says where it is now
    key(el, 'ArrowDown', { shiftKey: true });
    expect(live()).toBe('1, -70');
    expect(d.getAnnotationPosition('reading')).toEqual({ x: 1, y: -70 });
    expect(changes).toHaveLength(0); // nothing committed yet
    expect(moves.every((m) => !m.final)).toBe(true);
    key(el, 'Enter');
    expect(moves.at(-1)).toEqual({ id: 'reading', position: { x: 1, y: -70 }, final: true });
    expect(modelPos('reading')).toEqual({ x: 1, y: -70 });
    expect(changes).toHaveLength(1);
    expect(live()).toBe('Moved Tank 1.');
    d.undo();
    expect(modelPos('reading')).toEqual({ x: 0, y: -80 }); // one step for the whole move
  });

  it('commits on blur and reverts on Escape', () => {
    setup({ annotationDrag: 'always', annotationMoves: 'display' });
    const el = reading();
    el.focus();
    key(el, 'ArrowLeft');
    key(el, 'Escape');
    expect(d.getAnnotationPosition('reading')).toEqual({ x: 0, y: -80 });
    expect(moves.at(-1)).toEqual({ id: 'reading', position: { x: 0, y: -80 }, final: true });
    expect(live()).toBe('Move cancelled. Tank 1.');
    key(el, 'ArrowLeft');
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(moves.at(-1)).toEqual({ id: 'reading', position: { x: -1, y: -80 }, final: true });
    expect(live()).toBe('Moved Tank 1.');
    expect(d.isDirty()).toBe(false);
  });

  it('steps by the grid when grid snap is on', () => {
    setup({ annotationDrag: 'always', grid: { size: 20, snap: true, visible: false } });
    const el = title();
    key(el, 'ArrowRight');
    expect(d.getAnnotationPosition('title')).toEqual({ x: 40, y: 20 }); // 10 + 20, snapped
    key(el, 'ArrowDown', { shiftKey: true });
    expect(d.getAnnotationPosition('title')).toEqual({ x: 40, y: 120 });
  });

  it("leaves other keys, and keys inside a card's content, alone", () => {
    setup({ annotationDrag: 'always' });
    const inner = document.createElement('button');
    reading().append(inner);
    key(inner, 'ArrowRight');
    expect(d.getAnnotationPosition('reading')).toEqual({ x: 0, y: -80 });
    key(reading(), 'Enter'); // no move pending
    expect(moves).toEqual([]);
  });
});

describe('annotation drag with the editor (edit mode)', () => {
  it('drags in edit mode, selects on press, and arrow keys move the annotation, not the selection', () => {
    setup({ annotationDrag: 'edit', mode: 'edit' });
    const detach = attachEditor(d);
    flush();
    const el = reading();
    drag(el, 30, 0);
    expect(modelPos('reading')).toEqual({ x: 30, y: -80 });
    expect(d.getSelection()).toEqual([{ kind: 'annotation', id: 'reading' }]);
    expect(d.canUndo()).toBe(true);
    d.setSelection([{ kind: 'node', id: 'tank' }]);
    key(reading(), 'ArrowRight');
    key(reading(), 'Enter');
    expect(modelPos('reading')).toEqual({ x: 31, y: -80 });
    expect(d.toJSON().nodes[0]!.position).toEqual({ x: 100, y: 100 });
    detach();
  });
});

describe('annotation names and announcements', () => {
  const live = () => $('.pv-live').textContent;
  const label = (id: string) =>
    $(`[data-annotation-id="${id}"]:not(.pv-leader)`).getAttribute('aria-label');

  it('falls back to the text, then the anchor label, then the annotation id', () => {
    setup({ annotationDrag: 'always' });
    expect(label('title')).toBe('Area 1');
    expect(label('reading')).toBe('Tank 1');
    // No label on the anchor: the annotation's own id, never the node's internal id.
    d.update((tx) => tx.updateNode('tank', { label: undefined }));
    flush();
    expect(label('reading')).toBe('reading');
    expect(d.annotationName('reading')).toBe('reading');
  });

  it('uses annotationName, and its undefined result keeps the fallback', () => {
    const annotationName = vi.fn<NonNullable<DiagramOptions['annotationName']>>((a, anchor) =>
      a.kind === 'html' ? `Reading ${String(anchor?.data?.tag ?? '?')}` : undefined,
    );
    setup({ annotationDrag: 'always', annotationName });
    expect(label('reading')).toBe('Reading ?');
    expect(label('title')).toBe('Area 1');
    expect(annotationName.mock.calls.find(([a]) => a.id === 'reading')![1]!.id).toBe('tank');
    expect(annotationName.mock.calls.find(([a]) => a.id === 'title')![1]).toBeUndefined();
  });

  it('updates the name in place when the anchor data, the annotation or the option changes', () => {
    setup({
      annotationDrag: 'always',
      annotationName: (a, anchor) =>
        a.kind === 'html'
          ? `${String(a.data?.prefix ?? 'Reading')} ${String(anchor?.data?.tag)}`
          : undefined,
    });
    const el = reading();
    card.mockClear();
    // Live data on the anchor (its text lives in data).
    d.setNodeData('tank', { tag: 'TI-101' });
    flush();
    expect(label('reading')).toBe('Reading TI-101');
    // The annotation itself.
    d.update((tx) => tx.updateAnnotation('reading', { data: { prefix: 'Temp' } }));
    flush();
    expect(label('reading')).toBe('Temp TI-101');
    // The anchor through a transaction.
    d.update((tx) => tx.updateNode('tank', { data: { tag: 'TI-9' } }));
    flush();
    expect(label('reading')).toBe('Temp TI-9');
    // The option: names refresh without re-placing or re-rendering anything.
    card.mockClear();
    d.options.annotationName = () => 'Karta';
    d.refreshAnnotationNames();
    expect(label('reading')).toBe('Karta');
    expect(label('title')).toBe('Karta');
    expect(card).not.toHaveBeenCalled();
    expect(reading()).toBe(el); // same slot throughout: no remount
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('announces pointer drags without coordinates, and a vetoed commit as cancelled', () => {
    setup({ annotationDrag: 'always' });
    drag(reading(), 30, 0);
    expect(live()).toBe('Moved Tank 1.');
    d.options.beforeChange = () => false;
    drag(reading(), 30, 0);
    expect(live()).toBe('Move cancelled. Tank 1.');
    drag(reading(), 30, 0, false);
    pointer('pointercancel', reading(), 80, 50);
    expect(live()).toBe('Move cancelled. Tank 1.');
  });

  it('phrases every announcement through annotationMessages', () => {
    const moved = vi.fn((name: string, p: { x: number; y: number }, final: boolean) =>
      final ? `Przeniesiono: ${name}` : `${name} → ${p.x}`,
    );
    setup({
      annotationDrag: 'always',
      annotationMoves: 'display',
      annotationName: () => 'Karta',
      annotationMessages: { moved, cancelled: (name) => `Anulowano: ${name}` },
    });
    const el = reading();
    key(el, 'ArrowRight');
    expect(live()).toBe('Karta → 1');
    expect(moved).toHaveBeenLastCalledWith('Karta', { x: 1, y: -80 }, false);
    key(el, 'Enter');
    expect(live()).toBe('Przeniesiono: Karta');
    expect(moved).toHaveBeenLastCalledWith('Karta', { x: 1, y: -80 }, true);
    key(el, 'ArrowRight');
    key(el, 'Escape');
    expect(live()).toBe('Anulowano: Karta');
    // Pointer frames aren't announced: only the final move.
    moved.mockClear();
    drag(el, 30, 0);
    expect(moved).toHaveBeenCalledTimes(1);
    expect(live()).toBe('Przeniesiono: Karta');
  });

  it('keeps a default for a message left out, and says nothing for an empty string', () => {
    setup({
      annotationDrag: 'always',
      annotationMessages: { moved: (_n, _p, final) => (final ? undefined : '') },
    });
    const el = reading();
    key(el, 'ArrowRight');
    expect(live()).toBe(''); // steps silenced
    key(el, 'Enter');
    expect(live()).toBe('Moved Tank 1.');
    key(el, 'ArrowRight');
    key(el, 'Escape');
    expect(live()).toBe('Move cancelled. Tank 1.');
  });
});
