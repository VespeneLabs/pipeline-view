/**
 * Large diagrams (FR-55).
 * - Culling: above a node-count threshold, nodes, links and HTML/React overlay slots outside the visible
 *   area (plus a margin) are hidden with display:none, and their data ticks wait until they're visible.
 * - Level of detail: below per-layer zoom thresholds, labels, overlay cards and port dots are hidden via
 *   root classes (pv-lod-labels, pv-lod-overlays, pv-lod-ports). On by default only while culling is
 *   active, so small diagrams look exactly as before; `lod` overrides and `lod: false` disables it.
 * Both are view-only: nothing in the model or the export changes.
 */
import type { Diagram } from '../diagram/diagram';
import type { Rect } from '../model/types';
import type { View } from '../viewport/view';
import { FrameTask } from './frame';

export const DEFAULT_CULL_THRESHOLD = 300;
/** Screen pixels around the viewport that stay rendered, so a pan doesn't show empty edges. */
export const DEFAULT_CULL_MARGIN = 200;
export const DEFAULT_LOD = { labels: 0.4, overlays: 0.35, ports: 0.5 };

const intersects = (a: Rect, b: Rect) =>
  a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;

export class CullingController {
  private readonly culled = new Set<string>();
  private readonly hiddenLinks = new Set<string>();
  private readonly frame: FrameTask;
  private readonly cleanup: (() => void)[] = [];
  private active = false;

  constructor(
    private readonly diagram: Diagram,
    private readonly view: View,
  ) {
    this.frame = new FrameTask(
      () => view.root.ownerDocument.defaultView,
      () => this.update(),
    );
    const schedule = () => this.frame.schedule();
    const i = diagram.internal;
    this.cleanup.push(
      i.on('viewport', schedule),
      i.on('model', schedule),
      i.on('load', schedule),
      i.on('geometry', schedule),
    );
    const isCulled = (id: string) => this.culled.has(id);
    if (diagram.renderer) diagram.renderer.isCulled = isCulled;
    if (diagram.overlay) diagram.overlay.isCulled = isCulled;
    schedule();
  }

  private settings() {
    const c = this.diagram.options.culling;
    const enabled = c !== false;
    const threshold = (typeof c === 'object' ? c.threshold : undefined) ?? DEFAULT_CULL_THRESHOLD;
    const margin = (typeof c === 'object' ? c.margin : undefined) ?? DEFAULT_CULL_MARGIN;
    return { enabled, threshold, margin };
  }

  /** True while culling is active (enabled and above the threshold). */
  isActive(): boolean {
    return this.active;
  }

  /** Recomputes visibility and LOD now. Normally runs once per frame after a change. */
  update(): void {
    this.frame.cancel();
    const d = this.diagram;
    const r = d.renderer;
    if (!r) return;
    r.flush(); // routes and elements must be current
    const { enabled, threshold, margin } = this.settings();
    this.active = enabled && d.store.nodes.size >= threshold;
    this.applyLod();
    if (!this.active) {
      this.showAll();
      return;
    }
    const w = this.view.root.clientWidth;
    const h = this.view.root.clientHeight;
    if (!w || !h) return; // no layout yet: keep everything visible
    const tl = d.screenToDiagram({ x: -margin, y: -margin });
    const br = d.screenToDiagram({ x: w + margin, y: h + margin });
    const visible: Rect = { x: tl.x, y: tl.y, width: br.x - tl.x, height: br.y - tl.y };

    const shown = new Set<string>();
    for (const n of d.store.nodes.values()) {
      const b = d.itemBounds({ kind: 'node', id: n.id });
      const inView = !!b && intersects(b, visible);
      const was = this.culled.has(n.id);
      if (inView && was) {
        this.culled.delete(n.id);
        shown.add(n.id);
        this.setNodeHidden(n.id, false);
      } else if (!inView && !was) {
        this.culled.add(n.id);
        this.setNodeHidden(n.id, true);
      }
    }
    for (const id of this.culled) if (!d.store.nodes.has(id)) this.culled.delete(id);

    for (const l of d.store.links.values()) {
      const b = r.linkBounds(l.id);
      const hide = !!b && !intersects(b, visible);
      if (hide === this.hiddenLinks.has(l.id)) continue;
      if (hide) this.hiddenLinks.add(l.id);
      else this.hiddenLinks.delete(l.id);
      setHidden(r.elementOf('link', l.id), hide);
    }
    for (const id of this.hiddenLinks) if (!d.store.links.has(id)) this.hiddenLinks.delete(id);

    if (shown.size) {
      r.catchUp(shown);
      d.overlay?.catchUp(shown);
    }
  }

  private setNodeHidden(id: string, hidden: boolean): void {
    setHidden(this.diagram.renderer?.elementOf('node', id), hidden);
    for (const el of this.diagram.overlay?.slotsOf(id) ?? []) setHidden(el, hidden);
  }

  private showAll(): void {
    if (!this.culled.size && !this.hiddenLinks.size) return;
    const shown = new Set(this.culled);
    for (const id of this.culled) this.setNodeHidden(id, false);
    for (const id of this.hiddenLinks)
      setHidden(this.diagram.renderer?.elementOf('link', id), false);
    this.culled.clear();
    this.hiddenLinks.clear();
    this.diagram.renderer?.catchUp(shown);
    this.diagram.overlay?.catchUp(shown);
  }

  private applyLod(): void {
    const opt = this.diagram.options.lod;
    const root = this.view.root;
    const lod =
      opt === false ? null : opt ? { ...DEFAULT_LOD, ...opt } : this.active ? DEFAULT_LOD : null;
    const zoom = this.diagram.getViewport().zoom;
    root.classList.toggle('pv-lod-labels', !!lod && zoom < lod.labels);
    root.classList.toggle('pv-lod-overlays', !!lod && zoom < lod.overlays);
    root.classList.toggle('pv-lod-ports', !!lod && zoom < lod.ports);
  }

  /** Shows a culled node right away (keyboard focus can't land on display:none). */
  reveal(id: string): void {
    if (!this.culled.delete(id)) return;
    this.setNodeHidden(id, false);
    this.diagram.renderer?.catchUp([id]);
    this.diagram.overlay?.catchUp(new Set([id]));
  }

  /** Runs `fn` with everything visible (export), then culls again. */
  withAllVisible<T>(fn: () => T): T {
    this.showAll();
    this.diagram.overlay?.flush();
    try {
      return fn();
    } finally {
      this.update();
    }
  }

  /** Number of culled nodes (for tests and the stress page). */
  get culledCount(): number {
    return this.culled.size;
  }

  destroy(): void {
    this.frame.cancel();
    for (const c of this.cleanup) c();
    if (this.diagram.renderer) this.diagram.renderer.isCulled = undefined;
    if (this.diagram.overlay) this.diagram.overlay.isCulled = undefined;
  }
}

function setHidden(el: Element | undefined, hidden: boolean): void {
  if (!el) return;
  const style = (el as HTMLElement | SVGElement).style;
  if (hidden) style.display = 'none';
  else style.removeProperty('display');
}
