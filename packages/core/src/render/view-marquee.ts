/**
 * The selection box of view mode (`DiagramOptions.primaryDrag: 'select'`, the default): a primary-button
 * drag that starts on the background selects the nodes it touches, and Shift adds them to the selection.
 * Edit mode has its own marquee in the EditorController, which exists only there.
 *
 * A press that doesn't move stays a click, which clears the selection as usual (see input.ts). Touch
 * pans instead (see ViewportController).
 */
import type { Point } from '../model/types';
import type { ItemRef } from '../diagram/types';
import type { Diagram } from '../diagram/diagram';
import type { View } from '../viewport/view';
import { nodeBounds } from '../diagram/geometry';
import { DRAG_THRESHOLD } from '../viewport/controller';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface Press {
  pointerId: number;
  /** Client point of the press, and the same point in diagram coordinates. */
  down: Point;
  start: Point;
  base: ItemRef[];
  rect: SVGRectElement | null;
}

export class ViewMarquee {
  private press: Press | null = null;
  private readonly cleanup: (() => void)[] = [];

  constructor(
    private readonly diagram: Diagram,
    private readonly view: View,
  ) {
    const root = view.root;
    const on = (type: string, fn: (e: PointerEvent) => void) => {
      root.addEventListener(type, fn as EventListener);
      this.cleanup.push(() => root.removeEventListener(type, fn as EventListener));
    };
    on('pointerdown', this.onDown);
    on('pointermove', this.onMove);
    on('pointerup', (e) => this.end(e, true));
    on('pointercancel', (e) => this.end(e, false));
  }

  destroy(): void {
    this.press?.rect?.remove();
    this.press = null;
    for (const c of this.cleanup) c();
    this.cleanup.length = 0;
  }

  private toDiagram(e: PointerEvent): Point {
    const r = this.view.root.getBoundingClientRect();
    return this.diagram.screenToDiagram({ x: e.clientX - r.left, y: e.clientY - r.top });
  }

  private onDown = (e: PointerEvent): void => {
    // A second pointer or another button ends a box in progress.
    this.press?.rect?.remove();
    this.press = null;
    const d = this.diagram;
    if (e.button !== 0 || !e.isPrimary || e.pointerType === 'touch') return;
    if (d.getMode() !== 'view' || (d.options.primaryDrag ?? 'select') !== 'select') return;
    const root = this.view.root;
    if (root.classList.contains('pv-pan-ready')) return; // Space + drag pans
    const target = e.target as Element | null;
    // Items keep their click, and HTML content (reading cards, node renderers) its own gestures.
    if (d.hitTest(target) || target?.closest?.('[data-draggable]')) return;
    this.press = {
      pointerId: e.pointerId,
      down: { x: e.clientX, y: e.clientY },
      start: this.toDiagram(e),
      base: e.shiftKey ? d.getSelection() : [],
      rect: null,
    };
  };

  private onMove = (e: PointerEvent): void => {
    const p = this.press;
    if (!p || p.pointerId !== e.pointerId) return;
    if (!p.rect) {
      if (Math.hypot(e.clientX - p.down.x, e.clientY - p.down.y) < DRAG_THRESHOLD) return;
      try {
        this.view.root.setPointerCapture(e.pointerId);
      } catch {
        /* not capturable (synthetic event, or already released) */
      }
      p.rect = this.view.root.ownerDocument.createElementNS(SVG_NS, 'rect');
      p.rect.setAttribute('class', 'pv-marquee');
      this.view.layers.interaction.append(p.rect);
    }
    e.preventDefault();
    const r = rectOf(p.start, this.toDiagram(e));
    for (const k of ['x', 'y', 'width', 'height'] as const) p.rect.setAttribute(k, String(r[k]));
    p.rect.setAttribute('stroke-width', String(1 / this.diagram.getViewport().zoom));
  };

  private end(e: PointerEvent, select: boolean): void {
    const p = this.press;
    if (!p || p.pointerId !== e.pointerId) return;
    this.press = null;
    if (!p.rect) return;
    p.rect.remove();
    const d = this.diagram;
    // The click that ends the drag must not clear the selection or reach nodeClick.
    d.suppressNextClick();
    if (!select) return;
    const r = rectOf(p.start, this.toDiagram(e));
    const seen = new Set(p.base.filter((i) => i.kind === 'node').map((i) => i.id));
    const hit: ItemRef[] = [];
    for (const n of d.store.nodes.values()) {
      if (seen.has(n.id)) continue;
      const b = nodeBounds(n, d.symbols.get(n.type));
      if (
        b.x < r.x + r.width &&
        r.x < b.x + b.width &&
        b.y < r.y + r.height &&
        r.y < b.y + b.height
      )
        hit.push({ kind: 'node', id: n.id });
    }
    d.setSelection([...p.base, ...hit]);
  }
}

function rectOf(a: Point, b: Point) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}
