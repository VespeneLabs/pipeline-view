/**
 * Keyboard access (NFR-4). The root is focusable. Nodes use a roving tabindex, and a focus ring is drawn
 * in the interaction layer because SVG outlines are unreliable across browsers.
 *
 * Keys (no Ctrl/Cmd):
 * - Arrows move focus to the nearest node in that direction. In edit mode this needs Alt, since plain
 *   arrows nudge the selection there.
 * - Home / End go to the first / last node in reading order.
 * - Enter (view mode) selects the focused node and emits nodeClick. Escape (view mode) clears the selection.
 * - + / - zoom around the center, and 0 zooms to fit. These work in both modes.
 * - F8 / Shift+F8 step to the next / previous item with problem markers (FR-48), in both modes.
 */
import type { Point, Rect } from '../model/types';
import type { Diagram } from '../diagram/diagram';
import type { View } from '../viewport/view';
import { nodeBounds } from '../diagram/geometry';

const SVG_NS = 'http://www.w3.org/2000/svg';
const RING_PAD = 4;
const ZOOM_STEP = 1.25;

type Dir = 'left' | 'right' | 'up' | 'down';
const ARROWS: Record<string, Dir> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

export class KeyboardNavigation {
  private focusedId: string | null = null;
  private readonly ring: SVGRectElement;
  private readonly cleanup: (() => void)[] = [];

  constructor(
    private readonly diagram: Diagram,
    private readonly view: View,
  ) {
    const doc = view.root.ownerDocument;
    this.ring = doc.createElementNS(SVG_NS, 'rect');
    this.ring.setAttribute('class', 'pv-focus-ring');
    this.ring.style.display = 'none';
    view.layers.interaction.append(this.ring);

    const on = (t: EventTarget, type: string, fn: EventListener) => {
      t.addEventListener(type, fn);
      this.cleanup.push(() => t.removeEventListener(type, fn));
    };
    on(view.root, 'keydown', this.onKey as EventListener);
    on(view.root, 'focusin', this.onFocusIn as EventListener);
    on(view.root, 'focusout', this.onFocusOut as EventListener);
    this.cleanup.push(
      diagram.internal.on('model', () => this.updateRing()),
      diagram.internal.on('load', () => this.setFocused(null, false)),
    );
  }

  private nodeEl(id: string): SVGGElement | null {
    return this.view.layers.nodes.querySelector(`[data-node-id="${id.replace(/["\\]/g, '\\$&')}"]`);
  }

  private boundsOf(id: string): Rect | undefined {
    return this.diagram.itemBounds({ kind: 'node', id });
  }

  /** Moves the roving tabindex (and optionally DOM focus) to a node. */
  setFocused(id: string | null, focus = true): void {
    if (this.focusedId && this.focusedId !== id)
      this.nodeEl(this.focusedId)?.setAttribute('tabindex', '-1');
    this.focusedId = id;
    if (!id) {
      this.ring.style.display = 'none';
      return;
    }
    // The renderer may not have flushed a freshly added node yet.
    this.diagram.renderer?.flush();
    this.diagram.culling?.reveal(id);
    const el = this.nodeEl(id);
    if (!el) return;
    el.setAttribute('tabindex', '0');
    if (focus) {
      el.focus({ preventScroll: true });
      this.ensureVisible(id);
    }
    this.updateRing();
  }

  getFocused(): string | null {
    return this.focusedId;
  }

  private onFocusIn = (e: FocusEvent) => {
    const hit = this.diagram.hitTest(e.target);
    if (hit?.kind === 'node' && hit.id !== this.focusedId) this.setFocused(hit.id, false);
    this.updateRing();
  };

  private onFocusOut = (e: FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (!next || !this.view.root.contains(next)) this.ring.style.display = 'none';
  };

  private updateRing(): void {
    const id = this.focusedId;
    const b = id ? this.boundsOf(id) : undefined;
    const el = id ? this.nodeEl(id) : null;
    const doc = this.view.root.ownerDocument;
    if (!b || !el || doc.activeElement !== el) {
      this.ring.style.display = 'none';
      return;
    }
    this.ring.style.display = '';
    this.ring.setAttribute('x', String(b.x - RING_PAD));
    this.ring.setAttribute('y', String(b.y - RING_PAD));
    this.ring.setAttribute('width', String(b.width + 2 * RING_PAD));
    this.ring.setAttribute('height', String(b.height + 2 * RING_PAD));
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.defaultPrevented) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const d = this.diagram;
    const view = d.getMode() === 'view';
    const dir = ARROWS[e.key];
    let handled = true;
    if (dir && (view || e.altKey)) this.move(dir);
    else if (e.key === 'Home' || e.key === 'End') this.jumpEnd(e.key === 'End');
    else if (e.key === '+' || e.key === '=') this.zoomBy(ZOOM_STEP);
    else if (e.key === '-' || e.key === '_') this.zoomBy(1 / ZOOM_STEP);
    else if (e.key === '0') {
      if (!d.isViewportLocked()) d.zoomToFit({ animate: true });
    } else if (e.key === 'F8') d.nextIssue(e.shiftKey ? -1 : 1);
    else if (view && e.key === 'Enter' && this.focusedId) this.activate(this.focusedId);
    else if (view && e.key === 'Escape') d.setSelection([]);
    else handled = false;
    if (handled) e.preventDefault();
  };

  private ordered(): string[] {
    return [...this.diagram.store.nodes.values()]
      .map((n) => ({ id: n.id, b: nodeBounds(n, this.diagram.symbols.get(n.type)) }))
      .sort((a, b) => a.b.y - b.b.y || a.b.x - b.b.x)
      .map((x) => x.id);
  }

  private jumpEnd(last: boolean): void {
    const ids = this.ordered();
    const id = last ? ids.at(-1) : ids[0];
    if (id) this.setFocused(id);
  }

  /** Nearest node whose center lies in the half-plane of `dir`, weighting sideways offset double. */
  private move(dir: Dir): void {
    const from = this.focusedId && this.boundsOf(this.focusedId);
    if (!from) {
      this.jumpEnd(false);
      return;
    }
    const c = center(from);
    let best: { id: string; score: number } | null = null;
    for (const n of this.diagram.store.nodes.values()) {
      if (n.id === this.focusedId) continue;
      const p = center(nodeBounds(n, this.diagram.symbols.get(n.type)));
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      const along = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
      const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      if (along <= 0) continue;
      const score = along + 2 * across;
      if (!best || score < best.score) best = { id: n.id, score };
    }
    if (best) this.setFocused(best.id);
  }

  private activate(id: string): void {
    const item = { kind: 'node' as const, id };
    const b = this.boundsOf(id)!;
    this.diagram.setSelection([item]);
    this.diagram.emit('nodeClick', {
      item,
      point: center(b),
      originalEvent: new MouseEvent('click'),
    });
  }

  private zoomBy(factor: number): void {
    if (this.diagram.isViewportLocked()) return;
    const v = this.diagram.getViewport();
    const r = this.view.root;
    const mid = { x: r.clientWidth / 2, y: r.clientHeight / 2 };
    const at = this.diagram.screenToDiagram(mid);
    const zoom = v.zoom * factor;
    this.diagram.setViewport({ zoom, x: mid.x - at.x * zoom, y: mid.y - at.y * zoom });
  }

  /** Pans (without zooming) so a focused node is fully on screen. */
  private ensureVisible(id: string): void {
    const b = this.boundsOf(id);
    if (b) this.reveal(b);
  }

  /** Pans (without zooming) so `b`, in diagram coordinates, is on screen with a small margin. */
  reveal(b: Rect): void {
    const r = this.view.root;
    if (!r.clientWidth) return;
    const tl = this.diagram.diagramToScreen({ x: b.x, y: b.y });
    const br = this.diagram.diagramToScreen({ x: b.x + b.width, y: b.y + b.height });
    const m = 24;
    let dx = 0;
    let dy = 0;
    if (tl.x < m) dx = m - tl.x;
    else if (br.x > r.clientWidth - m) dx = r.clientWidth - m - br.x;
    if (tl.y < m) dy = m - tl.y;
    else if (br.y > r.clientHeight - m) dy = r.clientHeight - m - br.y;
    if (dx || dy) {
      const v = this.diagram.getViewport();
      this.diagram.setViewport({ x: v.x + dx, y: v.y + dy }, { animate: true });
    }
  }

  destroy(): void {
    for (const c of this.cleanup) c();
    this.ring.remove();
  }
}

const center = (b: Rect): Point => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
