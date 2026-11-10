/**
 * SVG renderer for nodes and links. Every model event only marks things dirty; one rAF flush applies them.
 * - Data ticks (setNodeData) re-render only the symbol markup and data-status of the touched nodes. No routing.
 * - Structural changes reroute only the links attached to changed nodes, plus those the router reports as affected.
 */
import type { LinkModel, NodeModel, Point } from '../model/types';
import type { Crossing, Junction, RouteRequest, Router } from '../routing/types';
import type { SymbolDef } from '../symbols/types';
import type { ItemRef, ModelDiff } from '../diagram/types';
import type { Diagram } from '../diagram/diagram';
import type { View } from '../viewport/view';
import { FrameTask } from './frame';
import { RouteAnalyzer } from '../routing/analyze';
import { createRouter } from '../routing/router';
import {
  localToDiagram,
  nodeBounds,
  nodeTransform,
  portPoint,
  symbolSize,
} from '../diagram/geometry';
import { nodePorts } from '../symbols/resolve';
import type { PortDef } from '../symbols/types';
import { arrowsPath, linkPath, ticksPath } from './paths';

const SVG_NS = 'http://www.w3.org/2000/svg';
const LABEL_GAP = 16;
const SELECTION_PAD = 4;

interface NodeEl {
  g: SVGGElement;
  body: SVGGElement;
  symbol: SVGGElement;
  label: SVGTextElement | null;
  markup: string;
  node: NodeModel;
  /** Ports last rendered, to detect per-node port changes. */
  portSig?: string;
}

interface LinkEl {
  g: SVGGElement;
  hit: SVGPathElement;
  line: SVGPathElement;
  flow: SVGPathElement | null;
  arrows: SVGPathElement;
  d: string;
}

export interface RenderMetrics {
  /** Duration of the last flush, in ms. */
  lastFlushMs: number;
  /** Duration of the last flush that only carried data ticks. */
  lastDataFlushMs: number;
}

export class SvgRenderer {
  private readonly nodes = new Map<string, NodeEl>();
  private readonly links = new Map<string, LinkEl>();
  private readonly routes = new Map<string, Point[]>();
  /** Incremental line-jump / junction analysis: drag frames only re-check the links they reroute. */
  private analyzer = new RouteAnalyzer();
  private crossings = new Map<string, Point[]>();
  private readonly junctionLayer: SVGGElement;
  private readonly router: Router;

  private readonly dirtyNodes = new Set<string>();
  /** Nodes whose size changed outside the model (measured HTML nodes). */
  private readonly forceGeometry = new Set<string>();
  private readonly dataNodes = new Set<string>();
  private readonly reroute = new Set<string>();
  private readonly removedNodes = new Set<string>();
  private readonly removedLinks = new Set<string>();
  private selectionDirty = false;
  private fullRebuild = true;
  private readonly frame = new FrameTask(
    () => this.view.root.ownerDocument.defaultView,
    () => this.flush(),
  );
  private readonly unsubscribe: (() => void)[] = [];
  private selected = new Set<string>();
  readonly metrics: RenderMetrics = { lastFlushMs: 0, lastDataFlushMs: 0 };

  constructor(
    private readonly diagram: Diagram,
    private readonly view: View,
    router?: Router,
  ) {
    this.router = router ?? createRouter(diagram.options.routing);
    this.junctionLayer = this.svg('g', { class: 'pv-junctions' }) as SVGGElement;
    view.layers.links.after(this.junctionLayer);
    const i = diagram.internal;
    this.unsubscribe.push(
      i.on('load', () => this.markFull()),
      i.on('model', ({ diff }) => this.onModel(diff)),
      i.on('geometry', ({ ids }) => {
        for (const id of ids) {
          this.dirtyNodes.add(id);
          this.forceGeometry.add(id);
        }
        this.schedule();
      }),
      i.on('data', ({ ids }) => {
        for (const id of ids) this.dataNodes.add(id);
        this.schedule();
      }),
      diagram.on('selectionChange', () => {
        this.selectionDirty = true;
        this.schedule();
      }),
    );
    this.schedule();
  }

  // ---- scheduling ----------------------------------------------------------

  private markFull(): void {
    this.fullRebuild = true;
    this.schedule();
  }

  private schedule(): void {
    this.frame.schedule();
  }

  private onModel(diff: ModelDiff): void {
    for (const id of diff.removed.nodes) this.removedNodes.add(id);
    for (const id of diff.removed.links) this.removedLinks.add(id);
    for (const id of [...diff.added.nodes, ...diff.changed.nodes]) this.dirtyNodes.add(id);
    for (const id of [...diff.added.links, ...diff.changed.links]) this.reroute.add(id);
    this.schedule();
  }

  /** Applies all pending changes synchronously. Normally called from rAF; tests and export call it directly. */
  flush(): void {
    this.frame.cancel();
    const t0 = now();
    const dataOnly =
      !this.fullRebuild &&
      this.dirtyNodes.size + this.reroute.size + this.removedNodes.size + this.removedLinks.size ===
        0;
    if (this.fullRebuild) this.rebuild();
    else this.applyIncremental();
    for (const id of this.dataNodes) this.renderNodeData(id);
    this.dataNodes.clear();
    if (this.selectionDirty) this.renderSelection();
    const dt = now() - t0;
    this.metrics.lastFlushMs = dt;
    if (dataOnly) this.metrics.lastDataFlushMs = dt;
  }

  // ---- full / incremental --------------------------------------------------

  private rebuild(): void {
    this.fullRebuild = false;
    for (const el of this.nodes.values()) el.g.remove();
    for (const el of this.links.values()) el.g.remove();
    this.nodes.clear();
    this.links.clear();
    this.routes.clear();
    this.analyzer = new RouteAnalyzer();
    this.dirtyNodes.clear();
    this.reroute.clear();
    this.removedNodes.clear();
    this.removedLinks.clear();
    const store = this.diagram.store;
    const obstacles = new Map<string, ReturnType<typeof nodeBounds>>();
    for (const n of store.nodes.values()) {
      this.upsertNode(n);
      obstacles.set(n.id, nodeBounds(n, this.def(n)));
    }
    this.router.setObstacles(obstacles);
    this.routeLinks([...store.links.keys()]);
    this.selectionDirty = true;
  }

  private applyIncremental(): void {
    const store = this.diagram.store;
    const removed = [...this.removedLinks];
    for (const id of this.removedLinks) {
      this.links.get(id)?.g.remove();
      this.links.delete(id);
      this.routes.delete(id);
    }
    if (this.removedLinks.size) this.router.removeRoutes([...this.removedLinks]);
    for (const id of this.removedNodes) {
      this.nodes.get(id)?.g.remove();
      this.nodes.delete(id);
      for (const l of this.router.updateObstacle(id, null)) this.reroute.add(l);
    }
    for (const id of this.dirtyNodes) {
      const n = store.nodes.get(id);
      if (!n) continue;
      const prev = this.nodes.get(id)?.node;
      this.upsertNode(n);
      const geometryChanged =
        !prev ||
        this.forceGeometry.has(id) ||
        prev.position !== n.position ||
        prev.rotation !== n.rotation ||
        prev.flipX !== n.flipX ||
        prev.flipY !== n.flipY ||
        prev.type !== n.type;
      if (geometryChanged) {
        for (const l of this.router.updateObstacle(id, nodeBounds(n, this.def(n))))
          this.reroute.add(l);
        for (const l of store.linksOf(id)) this.reroute.add(l.id);
      }
    }
    const ids = [...this.reroute].filter((id) => store.links.has(id));
    this.removedLinks.clear();
    this.removedNodes.clear();
    this.dirtyNodes.clear();
    this.forceGeometry.clear();
    this.reroute.clear();
    // Removing links alone must still refresh jumps and junction dots.
    if (ids.length || removed.length) this.routeLinks(ids, removed);
  }

  // ---- nodes ---------------------------------------------------------------

  private def(n: NodeModel): SymbolDef | undefined {
    return this.diagram.symbols.get(n.type);
  }

  private upsertNode(n: NodeModel): void {
    let el = this.nodes.get(n.id);
    if (!el) {
      const g = this.svg('g', { class: 'pv-node' }) as SVGGElement;
      g.dataset.nodeId = n.id;
      // Roving tabindex: render/a11y.ts gives the focused node tabindex 0.
      g.setAttribute('role', 'button');
      g.setAttribute('tabindex', '-1');
      const body = this.svg('g', { class: 'pv-node-body' }) as SVGGElement;
      const symbol = this.svg('g', { class: 'pv-symbol' }) as SVGGElement;
      // Symbols are stroke-only. This transparent box makes the whole symbol clickable; ports stay on top.
      const hit = this.svg('rect', { class: 'pv-node-hit' });
      body.append(hit, symbol);
      g.append(body);
      this.view.layers.nodes.append(g);
      el = { g, body, symbol, label: null, markup: '', node: n };
      this.nodes.set(n.id, el);
      this.renderPorts(el, n);
    } else if (portSignature(nodePorts(this.def(n), n)) !== el.portSig) {
      // Type changed, or per-node ports changed (FR-40).
      for (const p of el.body.querySelectorAll('.pv-port')) p.remove();
      this.renderPorts(el, n);
    }
    el.node = n;
    const def = this.def(n);
    el.g.dataset.type = n.type;
    el.body.setAttribute('transform', nodeTransform(n, def));
    const size = symbolSize(def, n);
    const hit = el.body.firstElementChild!;
    hit.setAttribute('width', String(size.width));
    hit.setAttribute('height', String(size.height));
    this.setStatus(el.g, n.status);
    el.g.toggleAttribute('data-locked', !!n.locked);
    this.setAriaLabel(el.g, n, def);
    this.renderSymbol(el, n, def);
    this.renderLabel(el, n, def);
    if (this.selected.has(refKey({ kind: 'node', id: n.id }))) this.placeSelectionBox(n.id);
  }

  /** "P-101, Centrifugal pump, alarm": label (or id), symbol name, then status (NFR-4). */
  private setAriaLabel(g: Element, n: NodeModel, def: SymbolDef | undefined): void {
    const parts = [n.label || n.id, def?.name ?? n.type];
    if (n.status) parts.push(n.status);
    const text = parts.join(', ');
    if (g.getAttribute('aria-label') !== text) g.setAttribute('aria-label', text);
  }

  private renderNodeData(id: string): void {
    const el = this.nodes.get(id);
    const n = this.diagram.store.nodes.get(id);
    if (!el || !n || el.node === n) return;
    const statusChanged = el.node.status !== n.status;
    el.node = n;
    this.setStatus(el.g, n.status);
    if (statusChanged) this.setAriaLabel(el.g, n, this.def(n));
    this.renderSymbol(el, n, this.def(n));
  }

  private renderSymbol(el: NodeEl, n: NodeModel, def: SymbolDef | undefined): void {
    let markup: string;
    if (!def) {
      const { width: w, height: h } = symbolSize(def, n);
      markup = `<rect class="pv-missing" width="${w}" height="${h}" fill="none" stroke="currentColor" stroke-dasharray="4 4"/>`;
    } else if (def.render) {
      markup = def.render({ data: n.data ?? {}, label: n.label, status: n.status });
    } else {
      markup = def.svg ?? '';
    }
    if (markup === el.markup) return;
    el.markup = markup;
    el.symbol.innerHTML = markup;
  }

  private renderPorts(el: NodeEl, n: NodeModel): void {
    const ports = nodePorts(this.def(n), n);
    el.portSig = portSignature(ports);
    for (const p of ports) {
      const c = this.svg('circle', { class: 'pv-port', cx: p.position.x, cy: p.position.y, r: 4 });
      c.dataset.portId = p.id;
      el.body.append(c);
    }
  }

  /** Labels sit in diagram coordinates outside the transformed body, so they never rotate or mirror. */
  private renderLabel(el: NodeEl, n: NodeModel, def: SymbolDef | undefined): void {
    if (!n.label) {
      el.label?.remove();
      el.label = null;
      return;
    }
    if (!el.label) {
      el.label = this.svg('text', { class: 'pv-label', 'text-anchor': 'middle' }) as SVGTextElement;
      el.g.append(el.label);
    }
    let at: Point;
    if (def?.labelAnchor) at = localToDiagram(n, def, def.labelAnchor);
    else {
      const b = nodeBounds(n, def);
      at = { x: b.x + b.width / 2, y: b.y + b.height + LABEL_GAP };
    }
    el.label.setAttribute('x', String(at.x));
    el.label.setAttribute('y', String(at.y));
    if (el.label.textContent !== n.label) el.label.textContent = n.label;
  }

  // ---- links ---------------------------------------------------------------

  private endpoint(end: LinkModel['from']) {
    const n = this.diagram.store.nodes.get(end.node)!;
    const def = this.def(n);
    const p = portPoint(n, def, end.port);
    if (p) return { point: p.point, direction: p.direction, nodeId: n.id };
    const b = nodeBounds(n, def);
    return {
      point: { x: b.x + b.width / 2, y: b.y + b.height / 2 },
      direction: 'right' as const,
      nodeId: n.id,
    };
  }

  /** Routes `ids`, re-analyzes them (plus the `removed` links) incrementally and redraws what changed. */
  private routeLinks(ids: string[], removed: string[] = []): void {
    const store = this.diagram.store;
    const requests: RouteRequest[] = [];
    const manual: string[] = [];
    for (const id of ids) {
      const l = store.links.get(id)!;
      const from = this.endpoint(l.from);
      const to = this.endpoint(l.to);
      if (l.routing === 'manual') {
        manual.push(id);
        this.routes.set(id, [from.point, ...(l.waypoints ?? []), to.point]);
      } else {
        requests.push({ linkId: id, from, to, waypoints: l.waypoints });
      }
    }
    // A link that switched auto -> manual must not keep its stale auto route in the router's lanes.
    if (manual.length) this.router.removeRoutes(manual);
    for (const r of this.router.route(requests)) this.routes.set(r.linkId, r.points);
    const { crossings, junctions } = this.analyzer
      .update([
        ...removed.map((id) => [id, null] as const),
        ...ids.map((id) => [id, this.routes.get(id) ?? null] as const),
      ])
      .result();
    const prevCrossings = this.crossings;
    this.crossings = groupCrossings(crossings);
    const redraw = new Set(ids);
    for (const id of new Set([...prevCrossings.keys(), ...this.crossings.keys()])) {
      if (key(prevCrossings.get(id)) !== key(this.crossings.get(id))) redraw.add(id);
    }
    for (const id of redraw) {
      const l = store.links.get(id);
      if (l) this.drawLink(l);
    }
    this.drawJunctions(junctions);
  }

  private drawLink(l: LinkModel): void {
    let el = this.links.get(l.id);
    if (!el) {
      const g = this.svg('g', { class: 'pv-link' }) as SVGGElement;
      g.dataset.linkId = l.id;
      const hit = this.svg('path', { class: 'pv-link-hit' }) as SVGPathElement;
      const line = this.svg('path', { class: 'pv-link-line' }) as SVGPathElement;
      const arrows = this.svg('path', { class: 'pv-link-arrows' }) as SVGPathElement;
      g.append(hit, line, arrows);
      this.view.layers.links.append(g);
      el = { g, hit, line, arrows, flow: null, d: '' };
      this.links.set(l.id, el);
    }
    el.g.dataset.kind = l.kind;
    el.g.toggleAttribute('data-locked', !!l.locked);
    this.setStatus(el.g, l.status);
    const points = this.routes.get(l.id) ?? [];
    const d = linkPath(points, this.crossings.get(l.id), this.jumpRadius());
    if (d !== el.d) {
      el.d = d;
      el.hit.setAttribute('d', d);
      el.line.setAttribute('d', d);
      el.flow?.setAttribute('d', d);
    }
    const showArrows = l.arrows ?? l.kind === 'process';
    // The marks path carries flow arrows and, for pneumatic links, the paired tick marks.
    let marks = showArrows ? arrowsPath(points, this.cssNumber('--pv-arrow-size', 10)) : '';
    if (l.kind === 'pneumatic') marks += ticksPath(points, this.cssNumber('--pv-tick-spacing', 40));
    el.arrows.setAttribute('d', marks);
    const flowing = Boolean(l.data?.flowing);
    if (flowing && !el.flow) {
      el.flow = this.svg('path', { class: 'pv-link-flow', d }) as SVGPathElement;
      el.line.after(el.flow);
    } else if (!flowing && el.flow) {
      el.flow.remove();
      el.flow = null;
    }
    el.g.toggleAttribute('data-flowing', flowing);
  }

  private drawJunctions(junctions: Junction[]): void {
    const r = this.cssNumber('--pv-junction-radius', 4.8);
    this.junctionLayer.replaceChildren(
      ...junctions.map((j) =>
        this.svg('circle', { class: 'pv-junction', cx: j.point.x, cy: j.point.y, r }),
      ),
    );
  }

  // ---- selection -----------------------------------------------------------

  private renderSelection(): void {
    this.selectionDirty = false;
    const next = new Set(this.diagram.getSelection().map(refKey));
    for (const k of this.selected) {
      if (next.has(k)) continue;
      const el = this.elFor(k);
      el?.classList.remove('pv-selected');
      el?.querySelector(':scope > .pv-selection-box')?.remove();
    }
    for (const k of next) {
      const el = this.elFor(k);
      el?.classList.add('pv-selected');
      const [kind, id] = k.split('\u0000');
      if (kind === 'node') this.placeSelectionBox(id!);
    }
    this.selected = next;
  }

  /** Rounded box behind a selected node's symbol (Figma 1:52), at the rotated bounds plus padding. */
  private placeSelectionBox(id: string): void {
    const el = this.nodes.get(id);
    if (!el) return;
    let box = el.g.querySelector<SVGRectElement>(':scope > .pv-selection-box');
    if (!box) {
      box = this.svg('rect', { class: 'pv-selection-box' }) as SVGRectElement;
      el.g.prepend(box);
    }
    const b = nodeBounds(el.node, this.def(el.node));
    const pad = SELECTION_PAD;
    box.setAttribute('x', String(b.x - pad));
    box.setAttribute('y', String(b.y - pad));
    box.setAttribute('width', String(b.width + 2 * pad));
    box.setAttribute('height', String(b.height + 2 * pad));
  }

  private elFor(k: string): Element | undefined {
    const [kind, id] = k.split('\u0000') as [ItemRef['kind'], string];
    return kind === 'node'
      ? this.nodes.get(id)?.g
      : kind === 'link'
        ? this.links.get(id)?.g
        : undefined;
  }

  // ---- helpers -------------------------------------------------------------

  private cssCache = new Map<string, number>();

  /** Reads a numeric --pv-* token once. Geometry (hop radius, arrow size) can't use var() directly. */
  private cssNumber(name: string, fallback: number): number {
    let v = this.cssCache.get(name);
    if (v === undefined) {
      const win = this.view.root.ownerDocument.defaultView;
      const raw = win?.getComputedStyle(this.view.root).getPropertyValue(name);
      v = raw ? parseFloat(raw) : NaN;
      if (!Number.isFinite(v)) v = fallback;
      this.cssCache.set(name, v);
    }
    return v;
  }

  private jumpRadius(): number {
    return this.cssNumber('--pv-jump-radius', 8);
  }

  private setStatus(el: Element, status: string | undefined): void {
    if (status) {
      if (el.getAttribute('data-status') !== status) el.setAttribute('data-status', status);
    } else if (el.hasAttribute('data-status')) el.removeAttribute('data-status');
  }

  private svg(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
    const el = this.view.root.ownerDocument.createElementNS(SVG_NS, tag) as SVGElement;
    for (const k in attrs) el.setAttribute(k, String(attrs[k]));
    return el;
  }

  /** Rendered polyline of a link in diagram coordinates, port points included. Undefined until routed. */
  getLinkPath(id: string): Point[] | undefined {
    return this.routes.get(id)?.map((p) => ({ ...p }));
  }

  /** Re-reads CSS tokens (after a theme change) and redraws all links. */
  refreshTokens(): void {
    this.cssCache.clear();
    this.markFull();
  }

  destroy(): void {
    for (const u of this.unsubscribe) u();
    this.frame.cancel();
    this.junctionLayer.remove();
  }
}

const refKey = (r: ItemRef) => `${r.kind}\u0000${r.id}`;
const key = (pts: Point[] | undefined) => (pts ?? []).map((p) => `${p.x},${p.y}`).join(';');
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function groupCrossings(crossings: Crossing[]): Map<string, Point[]> {
  const m = new Map<string, Point[]>();
  for (const c of crossings) {
    let list = m.get(c.linkId);
    if (!list) m.set(c.linkId, (list = []));
    list.push(c.point);
  }
  return m;
}

const portSignature = (ports: PortDef[]) =>
  ports.map((p) => `${p.id}@${p.position.x},${p.position.y}`).join('|');
