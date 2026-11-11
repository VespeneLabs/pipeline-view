/**
 * SVG renderer for nodes and links. Every model event only marks things dirty; one rAF flush applies them.
 * - Data ticks (setNodeData) re-render only the symbol markup and data-status of the touched nodes. No routing.
 * - Structural changes reroute only the links attached to changed nodes, plus those the router reports as affected.
 */
import type { LinkModel, NodeModel, Point, Rect } from '../model/types';
import type { Crossing, Junction, RouteRequest, Router } from '../routing/types';
import type { SymbolDef } from '../symbols/types';
import type { ItemRef, ModelDiff } from '../diagram/types';
import type { Diagram } from '../diagram/diagram';
import type { View } from '../viewport/view';
import { FrameTask } from './frame';
import { RouteAnalyzer } from '../routing/analyze';
import { createRouter } from '../routing/router';
import { createRoutingWorker, type RoutingWorker } from '../routing/worker-client';
import { DEFAULT_CULL_THRESHOLD } from './culling';
import {
  localToDiagram,
  nodeBounds,
  nodeTransform,
  portPoint,
  resolvePorts,
  symbolSize,
} from '../diagram/geometry';
import { nodePorts, nodeSize } from '../symbols/resolve';
import type { PortDef } from '../symbols/types';
import { arrowsPath, linkLabelPoint, linkPath, ticksPath } from './paths';

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
  /** Obstacle rect and resolved port points (diagram coordinates) last given to the router. */
  obstacleSig?: string;
  portPointSig?: string;
}

interface LinkEl {
  g: SVGGElement;
  hit: SVGPathElement;
  line: SVGPathElement;
  flow: SVGPathElement | null;
  arrows: SVGPathElement;
  d: string;
  label?: SVGTextElement;
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
  /** The router's node clearance, for deciding whether a resize reaches a route. */
  private readonly clearance: number;
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
  /** Ports with at least one link, as node/port keys; mirrored as data-occupied on port circles (FR-41). */
  private occupied = new Set<string>();
  readonly metrics: RenderMetrics = { lastFlushMs: 0, lastDataFlushMs: 0 };

  constructor(
    private readonly diagram: Diagram,
    private readonly view: View,
    router?: Router,
  ) {
    this.router = router ?? createRouter(diagram.options.routing);
    this.clearance = diagram.options.routing?.clearance ?? 12;
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
        // Live data that changes a node's ports or size (FR-40) needs the structural path: redraw the
        // ports, update the routing obstacle and reroute attached links. Plain data ticks stay cheap.
        for (const id of ids) {
          if (this.geometryFromData(id)) this.dirtyNodes.add(id);
          else this.dataNodes.add(id);
        }
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
    // Every full rebuild invalidates any off-thread job still in flight.
    this.routeEpoch++;
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
      const g = this.geometrySig(n);
      Object.assign(this.nodes.get(n.id)!, { obstacleSig: g.rectSig, portPointSig: g.pointSig });
      obstacles.set(n.id, g.rect);
    }
    this.router.setObstacles(obstacles);
    this.crossings = new Map();
    this.pendingWorker.clear();
    this.movedDuringFlight.clear();
    const all = [...store.links.keys()];
    if (this.useWorker(all.length)) this.routeOffThread(obstacles, all);
    else this.routeLinks(all);
    this.selectionDirty = true;
  }

  // ---- off-thread full routing (FR-55) -------------------------------------

  private worker: RoutingWorker | undefined;
  /** Bumped on every full rebuild: a worker result for an older document is dropped. */
  private routeEpoch = 0;
  /** Auto links drawn as placeholders, waiting for the worker's routes. */
  private readonly pendingWorker = new Set<string>();
  /** Nodes moved, resized or removed while a job was in flight: their obstacle updates are replayed. */
  private readonly movedDuringFlight = new Set<string>();

  private useWorker(linkCount: number): boolean {
    const opt = this.diagram.options.routingWorker;
    if (!opt || !this.router.adoptRoutes) return false;
    const injected = typeof opt === 'object' && !!opt.createWorker;
    if (!injected && typeof Worker === 'undefined') return false;
    const c = this.diagram.options.culling;
    const threshold = (typeof c === 'object' ? c.threshold : undefined) ?? DEFAULT_CULL_THRESHOLD;
    return linkCount >= threshold;
  }

  /**
   * Draws straight port-to-port placeholders now and routes everything in the Worker. When the result
   * comes back, links that are still placeholders adopt their routes; links re-routed on the main thread
   * meanwhile (an edit) keep theirs. A newer load drops the result; a failure falls back to sync routing.
   */
  private routeOffThread(obstacles: Map<string, Rect>, ids: string[]): void {
    const store = this.diagram.store;
    const epoch = this.routeEpoch;
    const requests: RouteRequest[] = [];
    for (const id of ids) {
      const l = store.links.get(id)!;
      const from = this.endpoint(l.from);
      const to = this.endpoint(l.to);
      if (l.routing === 'manual') {
        this.routes.set(id, [from.point, ...(l.waypoints ?? []), to.point]);
      } else {
        requests.push({ linkId: id, from, to, waypoints: l.waypoints });
        this.routes.set(id, [from.point, to.point]);
        this.pendingWorker.add(id);
      }
    }
    for (const id of ids) this.drawLink(store.links.get(id)!);
    this.drawJunctions([]);
    const opt = this.diagram.options.routingWorker;
    this.worker ??= createRoutingWorker(typeof opt === 'object' ? opt : {});
    this.worker.routeAll([...obstacles], requests, this.diagram.options.routing).then(
      (results) => {
        if (epoch !== this.routeEpoch || this.destroyed) return;
        const adopted = results.filter(
          (r) => this.pendingWorker.has(r.linkId) && store.links.has(r.linkId),
        );
        const keep = new Set(adopted.map((r) => r.linkId));
        this.router.adoptRoutes!(
          requests.filter((q) => keep.has(q.linkId)),
          adopted,
        );
        for (const r of adopted) {
          this.routes.set(r.linkId, r.points);
          this.pendingWorker.delete(r.linkId);
        }
        // Worker routes used the obstacles at job start. Replay obstacle updates for nodes that moved
        // meanwhile, now that the adopted routes are stored, and re-route what they affect.
        const reroute = new Set<string>();
        for (const id of this.movedDuringFlight) {
          const n = store.nodes.get(id);
          const rect = n ? nodeBounds(n, this.def(n)) : null;
          for (const l of this.router.updateObstacle(id, rect))
            if (store.links.has(l)) reroute.add(l);
        }
        this.movedDuringFlight.clear();
        if (reroute.size) this.routeLinks([...reroute]);
        // Manual links were drawn already; analyze them together with the adopted routes.
        const manual = ids.filter((id) => store.links.get(id)?.routing === 'manual');
        this.finishRoutes([...keep, ...manual].filter((id) => !reroute.has(id)));
      },
      (err: Error) => {
        if (err.name === 'AbortError' || epoch !== this.routeEpoch || this.destroyed) return;
        const left = [...this.pendingWorker].filter((id) => store.links.has(id));
        this.pendingWorker.clear();
        this.routeLinks(left);
      },
    );
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
      if (this.pendingWorker.size) this.movedDuringFlight.add(id);
    }
    for (const id of this.dirtyNodes) {
      const n = store.nodes.get(id);
      if (!n) continue;
      const prevEl = this.nodes.get(id);
      const prev = prevEl?.node;
      const prevPorts = prevEl?.portSig;
      this.upsertNode(n);
      // Per-node size and ports (FR-40) can change with data: the obstacle and attached links follow.
      const def = this.def(n);
      const geometryChanged =
        !prev ||
        this.forceGeometry.has(id) ||
        prevPorts !== this.nodes.get(id)!.portSig ||
        !sameSize(nodeSize(def, prev), nodeSize(def, n)) ||
        prev.position !== n.position ||
        prev.rotation !== n.rotation ||
        prev.flipX !== n.flipX ||
        prev.flipY !== n.flipY ||
        prev.type !== n.type;
      if (geometryChanged) {
        // Only what actually moved counts, so a content-sized HTML node whose text width changes on a
        // data tick doesn't re-route its links unless its ports or its obstacle really moved (FR-4).
        const el = this.nodes.get(id)!;
        const { rect, rectSig, pointSig } = this.geometrySig(n);
        const portsMoved = pointSig !== el.portPointSig;
        if (rectSig !== el.obstacleSig) {
          // The main router can't see pending (placeholder) links yet; replay this after adoption.
          if (this.pendingWorker.size) this.movedDuringFlight.add(id);
          const own = new Set(store.linksOf(id).map((l) => l.id));
          for (const l of this.router.updateObstacle(id, rect)) {
            // The router always reports the node's own links. With the ports in place, they only need a
            // new route when the resized node (plus the router's clearance) now reaches their path.
            if (
              portsMoved ||
              !own.has(l) ||
              crossesInterior(this.routes.get(l), rect, this.clearance)
            ) {
              this.reroute.add(l);
            }
          }
        }
        if (portsMoved) {
          for (const l of store.linksOf(id)) this.reroute.add(l.id);
        }
        el.obstacleSig = rectSig;
        el.portPointSig = pointSig;
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

  /** The node's obstacle rect and resolved port points, as comparable signatures. */
  private geometrySig(n: NodeModel) {
    const def = this.def(n);
    const rect = nodeBounds(n, def);
    const rectSig = `${rect.x},${rect.y},${rect.width},${rect.height}`;
    const pointSig = resolvePorts(n, def)
      .map((p) => `${p.id}@${p.point.x},${p.point.y}:${p.direction}`)
      .join('|');
    return { rect, rectSig, pointSig };
  }

  private def(n: NodeModel): SymbolDef | undefined {
    return this.diagram.symbols.get(n.type);
  }

  private upsertNode(n: NodeModel): void {
    let el = this.nodes.get(n.id);
    if (!el) {
      const g = this.svg('g', { class: 'pv-node' }) as SVGGElement;
      g.dataset.nodeId = n.id;
      // Stable test hooks (part of the public API, see @vespenelabs/pipeline-view/testing).
      g.dataset.pvNodeId = n.id;
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
    this.renderPortLabels(el, n, def);
    if (this.selected.has(refKey({ kind: 'node', id: n.id }))) this.placeSelectionBox(n.id);
  }

  /** "P-101, Centrifugal pump, alarm": label (or id), symbol name, then status (NFR-4). */
  private setAriaLabel(g: Element, n: NodeModel, def: SymbolDef | undefined): void {
    const parts = [n.label || n.id, def?.name ?? n.type];
    if (n.status) parts.push(n.status);
    const text = parts.join(', ');
    if (g.getAttribute('aria-label') !== text) g.setAttribute('aria-label', text);
  }

  /** @internal Culling (FR-55): data ticks for culled nodes wait until the node is visible again. */
  isCulled: ((nodeId: string) => boolean) | undefined;
  private readonly staleData = new Set<string>();

  /** @internal Re-renders nodes whose data ticks were deferred while culled. */
  catchUp(ids: Iterable<string>): void {
    for (const id of ids) {
      if (!this.staleData.delete(id)) continue;
      this.renderNodeData(id);
    }
  }

  /** @internal Bounds of a link's rendered route (diagram coordinates), for culling. */
  linkBounds(id: string): { x: number; y: number; width: number; height: number } | undefined {
    const pts = this.routes.get(id);
    if (!pts?.length) return undefined;
    let x1 = Infinity;
    let y1 = Infinity;
    let x2 = -Infinity;
    let y2 = -Infinity;
    for (const p of pts) {
      if (p.x < x1) x1 = p.x;
      if (p.y < y1) y1 = p.y;
      if (p.x > x2) x2 = p.x;
      if (p.y > y2) y2 = p.y;
    }
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  }

  /** @internal Element of a node or link, for culling. */
  elementOf(kind: 'node' | 'link', id: string): SVGGElement | undefined {
    return kind === 'node' ? this.nodes.get(id)?.g : this.links.get(id)?.g;
  }

  private renderNodeData(id: string): void {
    if (this.isCulled?.(id)) {
      this.staleData.add(id);
      return;
    }
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
      c.dataset.pvPortId = p.id;
      if (this.occupied.has(`${n.id}\u0000${p.id}`)) c.setAttribute('data-occupied', '');
      el.body.append(c);
    }
  }

  /** True when a node's ports or size differ from what was last rendered (data-driven per-node ports). */
  private geometryFromData(id: string): boolean {
    const el = this.nodes.get(id);
    const n = this.diagram.store.nodes.get(id);
    if (!el || !n || el.node === n) return false;
    const def = this.def(n);
    if (typeof def?.ports !== 'function' && typeof def?.size !== 'function') return false;
    return (
      portSignature(nodePorts(def, n)) !== el.portSig ||
      !sameSize(nodeSize(def, el.node), nodeSize(def, n))
    );
  }

  /** Port labels (FR-40), like node labels, sit outside the transformed body so they never rotate or mirror. */
  private renderPortLabels(el: NodeEl, n: NodeModel, def: SymbolDef | undefined): void {
    for (const t of el.g.querySelectorAll(':scope > .pv-port-label')) t.remove();
    const ports = nodePorts(def, n);
    if (!ports.some((p) => p.label)) return;
    const resolved = resolvePorts(n, def);
    ports.forEach((p, i) => {
      if (!p.label) return;
      const r = resolved[i]!;
      // 'inside': in the symbol, next to the port (step back against the outward direction).
      // 'outside': beyond the port. 'above'/'outside' also lift the text off the pipe line.
      const placement = p.labelPlacement ?? 'inside';
      const horizontal = r.direction === 'left' || r.direction === 'right';
      const out = placement === 'outside' ? 1 : -1;
      const d = PORT_LABEL_INSET * out;
      const lift = placement === 'inside' ? 0 : PORT_LABEL_LIFT;
      const at = {
        x:
          r.point.x +
          (r.direction === 'left' ? -d : r.direction === 'right' ? d : lift) +
          (p.labelOffset?.x ?? 0),
        y:
          r.point.y +
          (r.direction === 'top' ? -d : r.direction === 'bottom' ? d : -lift) +
          (p.labelOffset?.y ?? 0),
      };
      // Text runs away from the port: into the symbol when inside, away from it when outside.
      const towardsLeft = (r.direction === 'right') === out < 0;
      const t = this.svg('text', {
        class: 'pv-port-label',
        x: at.x,
        y: at.y,
        'text-anchor': horizontal ? (towardsLeft ? 'end' : 'start') : lift ? 'start' : 'middle',
        'dominant-baseline': horizontal && lift ? 'auto' : 'middle',
      });
      t.dataset.portId = p.id;
      t.textContent = p.label;
      el.g.append(t);
    });
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
    for (const id of ids) this.pendingWorker.delete(id); // routed here: no longer waiting for the Worker
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
    this.finishRoutes(ids, removed);
  }

  /** Line jumps, junction dots and redraws for links whose routes just changed. */
  private finishRoutes(ids: string[], removed: string[] = []): void {
    const store = this.diagram.store;
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
    this.updateOccupied();
  }

  private drawLink(l: LinkModel): void {
    let el = this.links.get(l.id);
    if (!el) {
      const g = this.svg('g', { class: 'pv-link' }) as SVGGElement;
      g.dataset.linkId = l.id;
      g.dataset.pvLinkId = l.id;
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
    this.drawLinkLabel(el, l, points);
  }

  /** Link label: SVG text with a background halo, placed off nodes along the route. */
  private drawLinkLabel(el: LinkEl, l: LinkModel, points: Point[]): void {
    if (!l.label) {
      el.label?.remove();
      el.label = undefined;
      el.g.removeAttribute('aria-label');
      return;
    }
    if (!el.label) {
      el.label = this.svg('text', {
        class: 'pv-link-label',
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
      }) as SVGTextElement;
      el.g.append(el.label);
    }
    if (el.label.textContent !== l.label) el.label.textContent = l.label;
    // Estimated box (no layout read): wide enough for the halo around ~7 px glyphs.
    const size = { width: l.label.length * 7 + 12, height: 20 };
    const store = this.diagram.store;
    const avoid: Rect[] = [];
    if (l.labelPosition === undefined) {
      for (const n of store.nodes.values()) avoid.push(nodeBounds(n, this.def(n)));
    }
    const at = linkLabelPoint(points, size, avoid, l.labelPosition);
    el.label.setAttribute('x', String(at?.x ?? 0));
    el.label.setAttribute('y', String(at?.y ?? 0));
    if (at) el.label.removeAttribute('visibility');
    else el.label.setAttribute('visibility', 'hidden');
    const name = (id: string) => {
      const n = store.nodes.get(id);
      return n?.label || id;
    };
    el.g.setAttribute('aria-label', `${l.label}, ${name(l.from.node)} to ${name(l.to.node)}`);
  }

  private drawJunctions(junctions: Junction[]): void {
    const r = this.cssNumber('--pv-junction-radius', 4.8);
    this.junctionLayer.replaceChildren(
      ...junctions.map((j) =>
        this.svg('circle', { class: 'pv-junction', cx: j.point.x, cy: j.point.y, r }),
      ),
    );
  }

  /** Sets data-occupied on ports that have links, touching only the ports whose state changed. */
  private updateOccupied(): void {
    const next = new Set<string>();
    for (const l of this.diagram.store.links.values()) {
      next.add(`${l.from.node}\u0000${l.from.port}`);
      next.add(`${l.to.node}\u0000${l.to.port}`);
    }
    const set = (key: string, on: boolean) => {
      const [node, port] = key.split('\u0000') as [string, string];
      const el = this.nodes.get(node);
      if (!el) return;
      for (const c of el.body.querySelectorAll('.pv-port')) {
        if ((c as SVGElement).dataset.portId === port) c.toggleAttribute('data-occupied', on);
      }
    };
    for (const k of this.occupied) if (!next.has(k)) set(k, false);
    for (const k of next) if (!this.occupied.has(k)) set(k, true);
    this.occupied = next;
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

  private destroyed = false;

  destroy(): void {
    this.destroyed = true;
    for (const u of this.unsubscribe) u();
    this.frame.cancel();
    this.worker?.terminate();
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
  ports
    .map((p) => `${p.id}@${p.position.x},${p.position.y}:${p.direction}:${p.label ?? ''}`)
    .join('|');
const sameSize = (a: { width: number; height: number }, b: { width: number; height: number }) =>
  a.width === b.width && a.height === b.height;
const PORT_LABEL_INSET = 8;
/** How far 'above' / 'outside' port labels sit off the pipe line. */
const PORT_LABEL_LIFT = 4;

/**
 * True when a route's inner segments come closer than `clearance` to `r`, which the router never
 * produces. The first and last segments are port stubs, which may sit inside their own node's clearance.
 */
function crossesInterior(pts: Point[] | undefined, r: Rect, clearance: number): boolean {
  if (!pts) return true;
  const l = r.x - clearance;
  const t = r.y - clearance;
  const rt = r.x + r.width + clearance;
  const b = r.y + r.height + clearance;
  for (let k = 1; k + 2 < pts.length; k++) {
    const p = pts[k]!;
    const q = pts[k + 1]!;
    if (
      Math.max(p.x, q.x) > l &&
      Math.min(p.x, q.x) < rt &&
      Math.max(p.y, q.y) > t &&
      Math.min(p.y, q.y) < b
    ) {
      return true;
    }
  }
  return false;
}
