/**
 * Dragging annotations (`DiagramOptions.annotationDrag`), in view mode as well as edit mode.
 *
 * A drag frame only sets the annotation's display position: the overlay re-places that one annotation
 * and its leader, and no model transaction runs. On release the position is committed as one update()
 * (`annotationMoves: 'model'`) or stays display state (`'display'`). Either way the host hears about it
 * through `annotationMove`.
 *
 * The overlay marks draggable slots with `data-draggable`; the viewport controller doesn't pan from them.
 * A focused slot moves with the arrow keys; Enter or leaving it commits, Escape reverts.
 */
import type { Point } from '../model/types';
import type { Diagram } from '../diagram/diagram';
import type { View } from '../viewport/view';
import { DRAG_THRESHOLD } from '../viewport/controller';

/** Content that keeps its own pointer gestures (typing, selecting text), plus a host opt-out. */
const NO_DRAG =
  'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[data-pv-no-drag]';

const ARROWS: Record<string, Point> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

interface Move {
  id: string;
  el: Element;
  /** Effective position when the move began, and the display override it had (if any). */
  start: Point;
  override: boolean;
  /** Last position applied. */
  at: Point;
}

interface Press extends Move {
  pointerId: number;
  /** Client point of the press. */
  down: Point;
  dragging: boolean;
}

export class AnnotationDrag {
  private press: Press | null = null;
  /** A keyboard move that hasn't been committed yet. */
  private keys: Move | null = null;
  private readonly cleanup: (() => void)[] = [];

  constructor(
    private readonly diagram: Diagram,
    private readonly view: View,
  ) {
    const root = view.root;
    const on = (type: string, fn: (e: never) => void, capture = false) => {
      root.addEventListener(type, fn as EventListener, capture);
      this.cleanup.push(() => root.removeEventListener(type, fn as EventListener, capture));
    };
    on('pointerdown', this.onDown);
    on('pointermove', this.onMove);
    on('pointerup', this.onUp);
    on('pointercancel', this.onCancel);
    // Capture phase: a move key must not also nudge the selection or move node focus.
    on('keydown', this.onKey, true);
    on('focusout', this.onFocusOut);
    this.cleanup.push(
      diagram.internal.on('load', () => {
        // A new document: a move in progress goes back rather than carrying over.
        this.endPress(true);
        const k = this.keys;
        this.keys = null;
        if (k) this.finish(k, false);
      }),
    );
  }

  destroy(): void {
    this.endPress();
    this.keys = null;
    for (const c of this.cleanup) c();
    this.cleanup.length = 0;
  }

  /** The draggable slot an event target belongs to, with its annotation id. */
  private slot(target: EventTarget | null): { el: Element; id: string } | null {
    const el = (target as Element | null)?.closest?.<HTMLElement | SVGElement>('[data-draggable]');
    const id = el?.dataset.annotationId;
    if (!el || id === undefined || !this.view.root.contains(el)) return null;
    return this.diagram.isAnnotationDraggable(id) ? { el, id } : null;
  }

  private begin(el: Element, id: string): Move | null {
    const d = this.diagram;
    const start = d.getAnnotationPosition(id);
    if (!start) return null;
    const a = d.store.annotations.get(id)!;
    const override = start.x !== a.position.x || start.y !== a.position.y;
    return { id, el, start, override, at: start };
  }

  /** Grid snapping works on the absolute position, so anchored annotations land on the grid too. */
  private snap(id: string, p: Point): Point {
    const grid = this.diagram.options.grid;
    if (!grid?.snap || !(grid.size > 0)) return p;
    const a = this.diagram.store.annotations.get(id);
    const anchor = a?.anchor && this.diagram.store.nodes.get(a.anchor.node);
    const ox = anchor?.position.x ?? 0;
    const oy = anchor?.position.y ?? 0;
    return {
      x: Math.round((p.x + ox) / grid.size) * grid.size - ox,
      y: Math.round((p.y + oy) / grid.size) * grid.size - oy,
    };
  }

  private apply(m: Move, p: Point): void {
    if (p.x === m.at.x && p.y === m.at.y) return;
    m.at = p;
    this.diagram.moveAnnotationView(m.id, p);
    this.diagram.emit('annotationMove', { id: m.id, position: { ...p }, final: false });
  }

  /** Ends a move: commits `m.at`, or goes back to where it started. Emits the final `annotationMove`. */
  private finish(m: Move, commit: boolean): Point | undefined {
    const d = this.diagram;
    const a = d.store.annotations.get(m.id);
    if (!a) {
      // Removed meanwhile: leave no display position behind.
      d.moveAnnotationView(m.id, null);
      return undefined;
    }
    const display = d.options.annotationMoves === 'display';
    if (!commit) d.moveAnnotationView(m.id, m.override ? m.start : null);
    else if (!display) {
      // The model takes over: drop the display position, then commit one undoable step.
      d.moveAnnotationView(m.id, null);
      const moved = m.at.x !== a.position.x || m.at.y !== a.position.y;
      if (moved && !d.isPreviewing()) {
        d.update((tx) => tx.updateAnnotation(m.id, { position: { ...m.at } }));
      }
    }
    // Read back, so a vetoed commit (beforeChange) reports where the annotation really is.
    const position = d.getAnnotationPosition(m.id)!;
    d.emit('annotationMove', { id: m.id, position, final: true });
    return position;
  }

  // ---- pointer ---------------------------------------------------------------

  private onDown = (e: PointerEvent): void => {
    // A second pointer (pinch) or another button ends a drag in progress.
    if (this.press) this.endPress(true);
    if (e.button !== 0 || !e.isPrimary) return;
    const root = this.view.root;
    if (root.classList.contains('pv-pan-ready') || root.classList.contains('pv-placing')) return;
    const slot = this.slot(e.target);
    if (!slot || (e.target as Element).closest(NO_DRAG)) return;
    if (this.keys) this.endKeys(true);
    const move = this.begin(slot.el, slot.id);
    if (!move) return;
    this.press = {
      ...move,
      pointerId: e.pointerId,
      down: { x: e.clientX, y: e.clientY },
      dragging: false,
    };
  };

  private onMove = (e: PointerEvent): void => {
    const p = this.press;
    if (!p || p.pointerId !== e.pointerId) return;
    const dx = e.clientX - p.down.x;
    const dy = e.clientY - p.down.y;
    if (!p.dragging) {
      // Below the threshold it's still a click, which selects as usual.
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      p.dragging = true;
      try {
        this.view.root.setPointerCapture(e.pointerId);
      } catch {
        /* not capturable (synthetic event, or already released) */
      }
      this.view.root.classList.add('pv-annotation-dragging');
      p.el.setAttribute('data-dragging', '');
    }
    e.preventDefault();
    const zoom = this.diagram.getViewport().zoom;
    this.apply(p, this.snap(p.id, { x: p.start.x + dx / zoom, y: p.start.y + dy / zoom }));
  };

  private onUp = (e: PointerEvent): void => {
    if (this.press?.pointerId === e.pointerId) this.endPress(true, true);
  };

  private onCancel = (e: PointerEvent): void => {
    if (this.press?.pointerId === e.pointerId) this.endPress(true);
  };

  /** Ends the press. A drag is committed, or reverted when `commit` is false. */
  private endPress(emit = false, commit = false): void {
    const p = this.press;
    this.press = null;
    if (!p?.dragging) return;
    this.view.root.classList.remove('pv-annotation-dragging');
    p.el.removeAttribute('data-dragging');
    // The click that ends a drag must not select or reach nodeClick.
    this.diagram.suppressNextClick();
    if (emit) this.say(p, this.finish(p, commit), commit);
  }

  /** Announces how a move ended. A commit that changed nothing (a veto, for example) counts as cancelled. */
  private say(m: Move, at: Point | undefined, commit: boolean): void {
    if (!at) return;
    const d = this.diagram;
    const msg = d.options.annotationMessages;
    const name = d.annotationName(m.id);
    const moved = commit && (at.x !== m.start.x || at.y !== m.start.y);
    d.announce(
      moved
        ? (msg?.moved?.(name, at, true) ?? `Moved ${name}.`)
        : (msg?.cancelled?.(name) ?? `Move cancelled. ${name}.`),
    );
  }

  // ---- keyboard --------------------------------------------------------------

  private onKey = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = this.keys;
    const dir = ARROWS[e.key];
    if (dir) {
      // Only the slot itself: arrow keys inside a card's own controls stay theirs.
      const slot = (e.target as Element).matches?.('[data-draggable]') ? this.slot(e.target) : null;
      if (!slot) return;
      if (k && k.id !== slot.id) this.endKeys(true);
      const m = (this.keys ??= this.begin(slot.el, slot.id));
      if (!m) return;
      const grid = this.diagram.options.grid;
      // With grid snap the step is a grid cell; Shift takes a bigger step either way.
      const base = grid?.snap ? grid.size : 1;
      const step = e.shiftKey ? (grid?.snap ? base * 5 : (grid?.size ?? 10)) : base;
      const before = m.at;
      this.apply(m, this.snap(m.id, { x: m.at.x + dir.x * step, y: m.at.y + dir.y * step }));
      if (m.at !== before) {
        // One step: just where it is now. The name was read when the annotation got focus.
        const d = this.diagram;
        d.announce(
          d.options.annotationMessages?.moved?.(d.annotationName(m.id), { ...m.at }, false) ??
            `${Math.round(m.at.x)}, ${Math.round(m.at.y)}`,
        );
      }
    } else if (k && e.target === k.el && (e.key === 'Enter' || e.key === 'Escape')) {
      this.endKeys(e.key === 'Enter');
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  private onFocusOut = (e: FocusEvent): void => {
    if (this.keys && e.target === this.keys.el) this.endKeys(true);
  };

  private endKeys(commit: boolean): void {
    const k = this.keys;
    this.keys = null;
    if (!k) return;
    this.say(k, this.finish(k, commit), commit);
  }
}
