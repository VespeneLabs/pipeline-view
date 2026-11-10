/** Pointer, wheel and touch input for pan and zoom. Selection, dragging and connecting live in other layers. */
import type { Point } from '../model/types';
import type { DiagramMode, Viewport } from '../diagram/types';
import { clamp, wheelPixels, zoomAround } from './math';

export interface ViewportHost {
  root: HTMLElement;
  getViewport(): Viewport;
  /** Applies a new viewport immediately (no animation). */
  applyViewport(v: Viewport): void;
  getMode(): DiagramMode;
  minZoom: number;
  maxZoom: number;
}

/** Items that start their own gestures in edit mode, so a primary-button drag on them doesn't pan. */
const ITEM_SELECTOR = '[data-node-id],[data-link-id],[data-port-id],[data-annotation-id]';
/** Movement in px after which a press counts as a drag, not a click. */
export const DRAG_THRESHOLD = 4;

export class ViewportController {
  private readonly pointers = new Map<number, Point>();
  private pan: { start: Point; vp: Viewport; moved: boolean } | null = null;
  private pinch: { dist: number; mid: Point; vp: Viewport } | null = null;
  private spaceDown = false;
  /** True if the last primary press turned into a pan. Click handlers check it to avoid selecting after a drag. */
  suppressClick = false;
  private readonly cleanup: (() => void)[] = [];

  constructor(private readonly host: ViewportHost) {
    const root = host.root;
    const win = root.ownerDocument.defaultView;
    this.listen(root, 'pointerdown', this.onDown as EventListener);
    this.listen(root, 'pointermove', this.onMove as EventListener);
    this.listen(root, 'pointerup', this.onUp as EventListener);
    this.listen(root, 'pointercancel', this.onUp as EventListener);
    this.listen(root, 'wheel', this.onWheel as EventListener, { passive: false });
    if (win) {
      this.listen(win, 'keydown', this.onKey as EventListener);
      this.listen(win, 'keyup', this.onKey as EventListener);
      this.listen(win, 'blur', () => (this.spaceDown = false));
    }
  }

  private listen(t: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions) {
    t.addEventListener(type, fn, opts);
    this.cleanup.push(() => t.removeEventListener(type, fn, opts));
  }

  private local(e: { clientX: number; clientY: number }): Point {
    const r = this.host.root.getBoundingClientRect();
    // Synthetic events may lack coordinates. Fall back to the center rather than poisoning the viewport with NaN.
    const x = Number.isFinite(e.clientX) ? e.clientX - r.left : r.width / 2;
    const y = Number.isFinite(e.clientY) ? e.clientY - r.top : r.height / 2;
    return { x, y };
  }

  private canPan(e: PointerEvent): boolean {
    if (e.button === 1) return true;
    if (e.button !== 0) return false;
    if (this.spaceDown || this.host.getMode() === 'view') return true;
    // Edit mode: the editor owns mouse presses (marquee, node drag). Touch on the empty background pans.
    const t = e.target as Element | null;
    return e.pointerType === 'touch' && !t?.closest?.(ITEM_SELECTOR);
  }

  private onDown = (e: PointerEvent) => {
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 2) {
      this.pan = null;
      this.startPinch();
      return;
    }
    if (this.pointers.size > 2 || !this.canPan(e)) return;
    this.suppressClick = false;
    this.pan = { start: p, vp: this.host.getViewport(), moved: false };
    try {
      this.host.root.setPointerCapture(e.pointerId);
    } catch {
      /* pointer may already be released */
    }
  };

  private onMove = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    if (this.pinch) {
      this.updatePinch();
      return;
    }
    const pan = this.pan;
    if (!pan) return;
    const dx = p.x - pan.start.x;
    const dy = p.y - pan.start.y;
    if (!pan.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    pan.moved = true;
    this.suppressClick = true;
    this.host.root.classList.add('pv-panning');
    this.host.applyViewport({ ...pan.vp, x: pan.vp.x + dx, y: pan.vp.y + dy });
  };

  private onUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pinch && this.pointers.size < 2) {
      this.pinch = null;
      // Continue as a one-finger pan from the remaining pointer.
      const [rest] = this.pointers.values();
      this.pan = rest ? { start: rest, vp: this.host.getViewport(), moved: true } : null;
      return;
    }
    if (this.pointers.size === 0) {
      this.pan = null;
      this.host.root.classList.remove('pv-panning');
    }
  };

  private startPinch() {
    const [a, b] = [...this.pointers.values()] as [Point, Point];
    this.suppressClick = true;
    this.pinch = {
      dist: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      vp: this.host.getViewport(),
    };
  }

  private updatePinch() {
    const pinch = this.pinch!;
    const [a, b] = [...this.pointers.values()] as [Point, Point];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const zoom = clamp(
      (pinch.vp.zoom * Math.hypot(b.x - a.x, b.y - a.y)) / pinch.dist,
      this.host.minZoom,
      this.host.maxZoom,
    );
    const z = zoomAround(pinch.vp, zoom, pinch.mid);
    this.host.applyViewport({ zoom, x: z.x + mid.x - pinch.mid.x, y: z.y + mid.y - pinch.mid.y });
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const vp = this.host.getViewport();
    // Trackpad pinch arrives as ctrl+wheel with small deltas, so it gets a stronger factor.
    const k = e.ctrlKey ? 0.01 : 0.0015;
    const zoom = clamp(
      vp.zoom * Math.exp(-wheelPixels(e) * k),
      this.host.minZoom,
      this.host.maxZoom,
    );
    if (zoom !== vp.zoom) this.host.applyViewport(zoomAround(vp, zoom, this.local(e)));
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.code !== 'Space') return;
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    this.spaceDown = e.type === 'keydown';
    this.host.root.classList.toggle('pv-pan-ready', this.spaceDown);
  };

  destroy(): void {
    for (const c of this.cleanup) c();
    this.cleanup.length = 0;
  }
}
