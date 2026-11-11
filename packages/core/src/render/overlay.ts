/**
 * Annotations and HTML overlays (FR-15..18).
 * - Text annotations are SVG <text> in the annotations layer.
 * - HTML annotations, and nodes whose `data.overlay` names a renderer, get a positioned <div> in the
 *   HTML overlay. The overlay shares the scene's transform, so the content pans and zooms with the
 *   diagram but is never rotated.
 * - Anchored annotations follow their node. Their renderer sees the node's live data merged under the
 *   annotation's own data, so a reading card updates with setNodeData.
 */
import type { AnnotationModel, DataRecord, NodeModel, Point, Rect } from '../model/types';
import type { HtmlRenderer, ModelDiff } from '../diagram/types';
import type { Diagram } from '../diagram/diagram';
import type { View } from '../viewport/view';
import { FrameTask } from './frame';
import { nodeBounds } from '../diagram/geometry';
import { leaderPoints, linkPath } from './paths';
import { createRouter } from '../routing/router';
import type { Router } from '../routing/types';
import type { PortDirection } from '../symbols/types';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface Item {
  kind: 'node' | 'annotation';
  id: string;
  el: HTMLElement | SVGTextElement;
  rendererName?: string;
  cleanup?: (() => void) | void;
  /** Inputs of the last render. A re-render happens only when one of them changed. */
  source?: unknown;
  anchorSource?: unknown;
  /** Anchor geometry/status of the last placement. Data-only ticks leave these unchanged. */
  anchorPos?: unknown;
  anchorStatus?: string;
  leader?: SVGPathElement;
  /** Node renderer (FR-45); otherwise the item renders through htmlRenderers[rendererName]. */
  render?: HtmlRenderer;
  /** Measures content-sized node renderers and HTML annotations. */
  resize?: ResizeObserver;
  /** The slot carries the draggable attributes (focusable, named). */
  draggable?: boolean;
}

const aKey = (id: string) => `a\u0000${id}`;
const nKey = (id: string) => `n\u0000${id}`;

export class OverlayRenderer {
  private readonly items = new Map<string, Item>();
  private readonly dirty = new Set<string>();
  /** Keys dirtied by structural changes (move, rotate, flip, type, edits). They never take the data-tick shortcut. */
  private readonly structural = new Set<string>();
  private full = true;
  private readonly frame = new FrameTask(
    () => this.view.root.ownerDocument.defaultView,
    () => this.flush(),
  );
  private readonly unsubscribe: (() => void)[] = [];
  private readonly warned = new Set<string>();
  /** node id -> ids of annotations anchored to it, so a data tick touches only its own cards. */
  private readonly anchored = new Map<string, Set<string>>();
  private readonly anchorOf = new Map<string, string>();
  /** Separate router for leaders, so they avoid nodes without taking lanes from process links. */
  private leaderRouter: Router | undefined;
  private obstaclesDirty = true;

  constructor(
    private readonly diagram: Diagram,
    private readonly view: View,
  ) {
    const i = diagram.internal;
    this.unsubscribe.push(
      i.on('load', () => {
        this.full = true;
        this.schedule();
      }),
      i.on('model', ({ diff }) => this.onModel(diff)),
      i.on('data', ({ ids }) => {
        for (const id of ids) this.markNode(id, true);
        this.schedule();
      }),
      i.on('annotationView', ({ ids }) => {
        for (const id of ids) {
          this.dirty.add(aKey(id));
          this.structural.add(aKey(id));
        }
        this.schedule();
      }),
      i.on('geometry', ({ ids }) => {
        for (const id of ids) this.markNode(id, false);
        this.schedule();
      }),
    );
    this.schedule();
  }

  private onModel(diff: ModelDiff): void {
    if (diff.added.nodes.length + diff.changed.nodes.length + diff.removed.nodes.length) {
      this.obstaclesDirty = true;
    }
    for (const id of [
      ...diff.added.annotations,
      ...diff.changed.annotations,
      ...diff.removed.annotations,
    ]) {
      this.dirty.add(aKey(id));
    }
    for (const id of [...diff.added.nodes, ...diff.changed.nodes, ...diff.removed.nodes])
      this.markNode(id, false);
    this.schedule();
  }

  /** A node change affects its own overlay and every annotation anchored to it. */
  private markNode(id: string, dataOnly: boolean): void {
    this.dirty.add(nKey(id));
    for (const a of this.anchored.get(id) ?? []) {
      this.dirty.add(aKey(a));
      if (!dataOnly) this.structural.add(aKey(a));
    }
  }

  private setAnchor(annotationId: string, nodeId: string | undefined): void {
    const prev = this.anchorOf.get(annotationId);
    if (prev === nodeId) return;
    if (prev !== undefined) {
      this.anchored.get(prev)?.delete(annotationId);
      this.anchorOf.delete(annotationId);
    }
    if (nodeId !== undefined) {
      let set = this.anchored.get(nodeId);
      if (!set) this.anchored.set(nodeId, (set = new Set()));
      set.add(annotationId);
      this.anchorOf.set(annotationId, nodeId);
    }
  }

  private schedule(): void {
    this.frame.schedule();
  }

  /** @internal Culling (FR-55). */
  isCulled: ((nodeId: string) => boolean) | undefined;
  private readonly deferred = new Set<string>();

  /** @internal Releases work deferred while these nodes were culled. */
  catchUp(nodeIds: ReadonlySet<string>): void {
    let any = false;
    for (const key of this.deferred) {
      const [kind, id] = key.split('\u0000') as ['a' | 'n', string];
      const nodeId = kind === 'n' ? id : this.annotation(id)?.anchor?.node;
      if (!nodeId || nodeIds.has(nodeId)) {
        this.deferred.delete(key);
        this.dirty.add(key);
        this.structural.add(key);
        any = true;
      }
    }
    if (any) this.schedule();
  }

  /** @internal The overlay slots of a node: its own and those of annotations anchored to it. */
  slotsOf(nodeId: string): HTMLElement[] {
    const out: HTMLElement[] = [];
    const own = this.items.get(nKey(nodeId));
    if (own) out.push(own.el as HTMLElement);
    for (const a of this.anchored.get(nodeId) ?? []) {
      const it = this.items.get(aKey(a));
      // Only HTML slots: text annotations are SVG and stay with the drawing.
      if (it && it.el.namespaceURI !== SVG_NS) out.push(it.el as HTMLElement);
    }
    return out;
  }

  flush(): void {
    this.frame.cancel();
    const store = this.diagram.store;
    if (this.full) {
      this.full = false;
      for (const key of [...this.items.keys()]) this.remove(key);
      this.dirty.clear();
      for (const n of store.nodes.values()) this.dirty.add(nKey(n.id));
      for (const a of store.annotations.values()) this.dirty.add(aKey(a.id));
    }
    for (const key of this.dirty) {
      const [kind, id] = key.split('\u0000') as ['a' | 'n', string];
      // Culling (FR-55): slots of culled nodes (and annotations anchored to them) wait until visible.
      const nodeId = kind === 'n' ? id : this.annotation(id)?.anchor?.node;
      if (nodeId && store.nodes.has(nodeId) && this.isCulled?.(nodeId)) {
        this.deferred.add(key);
        continue;
      }
      if (kind === 'n') this.upsertNode(id);
      else this.upsertAnnotation(id);
    }
    this.dirty.clear();
    this.structural.clear();
  }

  // ---- nodes with data.overlay ----------------------------------------------

  private upsertNode(id: string): void {
    const key = nKey(id);
    const n = this.diagram.store.nodes.get(id);
    // A node renderer for the type (FR-45) wins over a data.overlay renderer.
    const spec = n ? this.diagram.options.nodeRenderers?.[n.type] : undefined;
    const name = spec
      ? `node:${n!.type}`
      : typeof n?.data?.overlay === 'string'
        ? n.data.overlay
        : undefined;
    const existing = this.items.get(key);
    if (!n || !name) {
      if (existing) this.remove(key);
      return;
    }
    if (existing && existing.rendererName !== name) this.remove(key);
    let item = this.items.get(key);
    const contentSized = !!spec && typeof spec !== 'function' && spec.sizing === 'content';
    if (!item) {
      item = this.createHtmlItem(key, 'node', id, name);
      if (spec) {
        item.render = typeof spec === 'function' ? spec : spec.render;
        item.el.classList.add('pv-node-html');
        if (contentSized) this.observeSize(item);
      }
    }
    const el = item.el as HTMLElement;
    const b = nodeBounds(n, this.diagram.symbols.get(n.type));
    // Content-sized nodes keep their natural size; the measured size drives bounds and ports.
    this.place(el, b, contentSized ? undefined : { width: b.width, height: b.height });
    if (item.source !== n) {
      item.source = n;
      this.callRenderer(item, n.data, n.status);
      if (contentSized) this.measure(item);
    }
  }

  private observeSize(item: Item): void {
    const RO = this.view.root.ownerDocument.defaultView?.ResizeObserver;
    if (!RO) return;
    item.resize = new RO(() => this.measure(item));
    item.resize.observe(item.el as HTMLElement);
  }

  /** A content-sized annotation re-places itself (leader, bounds) whenever its content resizes. */
  private observeAnnotation(item: Item, key: string): void {
    const RO = this.view.root.ownerDocument.defaultView?.ResizeObserver;
    if (!RO) return;
    item.resize = new RO(() => {
      this.dirty.add(key);
      this.structural.add(key);
      this.schedule();
    });
    item.resize.observe(item.el as HTMLElement);
  }

  /** Reports the content's layout size (diagram units: the overlay's scale isn't in offsetWidth). */
  private measure(item: Item): void {
    const el = item.el as HTMLElement;
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    if (width > 0 && height > 0) this.diagram.setMeasuredSize(item.id, { width, height });
  }

  // ---- annotations ---------------------------------------------------------

  private annotation(id: string): AnnotationModel | undefined {
    return this.diagram.store.annotations.get(id);
  }

  private upsertAnnotation(id: string): void {
    const key = aKey(id);
    const a = this.annotation(id);
    let item = this.items.get(key);
    const wantKind = a?.kind;
    const itemIsText = item?.el instanceof this.view.root.ownerDocument.defaultView!.SVGElement;
    if (
      !a ||
      (item && (wantKind === 'text') !== itemIsText) ||
      (a.kind === 'html' && item?.rendererName !== a.renderer)
    ) {
      if (item) this.remove(key);
      item = undefined;
      if (!a) return;
    }
    this.setAnchor(id, a.anchor?.node);
    const anchor = a.anchor ? this.diagram.store.nodes.get(a.anchor.node) : undefined;
    // Data-only tick on the anchor: nothing moved, so skip placement, text and leader (getBBox / offsetWidth
    // force layout). HTML cards still get the new data.
    if (
      item &&
      !this.structural.has(key) &&
      item.source === a &&
      item.anchorPos === anchor?.position &&
      item.anchorStatus === anchor?.status
    ) {
      if (a.kind === 'html' && item.anchorSource !== anchor) {
        item.anchorSource = anchor;
        this.callRenderer(
          item,
          anchor ? { ...anchor.data, ...a.data } : a.data,
          a.status ?? anchor?.status,
        );
      }
      return;
    }
    // The display position (a drag in progress, or host display state) wins over the model's.
    const rel = this.diagram.getAnnotationPosition(id) ?? a.position;
    const pos: Point = {
      x: rel.x + (anchor?.position.x ?? 0),
      y: rel.y + (anchor?.position.y ?? 0),
    };
    let box: Rect;
    if (a.kind === 'text') {
      item ??= this.createTextItem(key, id);
      const t = item.el as SVGTextElement;
      t.setAttribute('x', String(pos.x));
      t.setAttribute('y', String(pos.y));
      if (a.variant) t.dataset.variant = a.variant;
      else delete t.dataset.variant;
      if (t.textContent !== a.text) t.textContent = a.text;
      setStatus(t, a.status ?? anchor?.status);
      item.source = a;
      box = textBox(t, pos);
    } else {
      item ??= this.createHtmlItem(key, 'annotation', id, a.renderer);
      const el = item.el as HTMLElement;
      const contentSized = a.sizing === 'content';
      this.place(el, pos, contentSized ? undefined : a.size);
      if (contentSized) {
        el.style.width = el.style.height = '';
        el.style.minWidth = a.size ? `${a.size.width}px` : '';
        el.style.minHeight = a.size ? `${a.size.height}px` : '';
        if (!item.resize) this.observeAnnotation(item, key);
      } else if (item.resize) {
        item.resize.disconnect();
        item.resize = undefined;
        el.style.minWidth = el.style.minHeight = '';
        this.diagram.setAnnotationSize(id, null);
      }
      if (item.source !== a || item.anchorSource !== anchor) {
        item.source = a;
        item.anchorSource = anchor;
        const data: DataRecord | undefined = anchor ? { ...anchor.data, ...a.data } : a.data;
        this.callRenderer(item, data, a.status ?? anchor?.status);
      }
      box = {
        ...pos,
        width: (!contentSized && a.size?.width) || el.offsetWidth || 0,
        height: (!contentSized && a.size?.height) || el.offsetHeight || 0,
      };
      if (contentSized)
        this.diagram.setAnnotationSize(id, { width: box.width, height: box.height });
    }
    item.anchorPos = anchor?.position;
    item.anchorStatus = anchor?.status;
    const draggable = this.diagram.isAnnotationDraggable(id);
    if (draggable || item.draggable) {
      item.draggable = draggable;
      const name = a.kind === 'text' ? a.text : (anchor?.label ?? anchor?.id ?? id);
      setDraggable(item.el, draggable, name);
    }
    // Hidden by the host (display state): keep the element and its renderer, show nothing.
    const hidden = this.diagram.isAnnotationHidden(id);
    const style = (item.el as HTMLElement | SVGElement).style;
    if (style.display !== (hidden ? 'none' : '')) style.display = hidden ? 'none' : '';
    item.el.toggleAttribute('data-hidden', hidden);
    if (hidden) {
      item.leader?.remove();
      item.leader = undefined;
      return;
    }
    this.drawLeader(item, a, anchor, box);
  }

  private drawLeader(
    item: Item,
    a: AnnotationModel,
    anchor: NodeModel | undefined,
    box: Rect,
  ): void {
    const points = a.leader && anchor ? this.leaderRoute(a, anchor, box) : [];
    if (points.length < 2) {
      item.leader?.remove();
      item.leader = undefined;
      return;
    }
    if (!item.leader) {
      item.leader = this.view.root.ownerDocument.createElementNS(SVG_NS, 'path');
      item.leader.setAttribute('class', 'pv-leader');
      item.leader.dataset.annotationId = a.id;
      this.view.layers.leaders.append(item.leader);
    }
    item.leader.setAttribute('d', linkPath(points));
  }

  /**
   * Leader polyline (FR-18). With `leaderWaypoints`, it runs card edge → waypoints → node edge. Otherwise
   * it's routed orthogonally around other nodes between the facing edges, falling back to the direct elbow.
   */
  private leaderRoute(a: AnnotationModel, anchor: NodeModel, card: Rect): Point[] {
    const node = nodeBounds(anchor, this.diagram.symbols.get(anchor.type));
    if (a.leaderWaypoints?.length) {
      const wps = a.leaderWaypoints.map((p) => ({
        x: p.x + anchor.position.x,
        y: p.y + anchor.position.y,
      }));
      const last = wps.at(-1)!;
      // A final waypoint on or inside the node already marks where the leader meets it (e.g. a vessel shell).
      const inside =
        last.x >= node.x &&
        last.x <= node.x + node.width &&
        last.y >= node.y &&
        last.y <= node.y + node.height;
      return [edgeToward(card, wps[0]!), ...wps, ...(inside ? [] : [edgeToward(node, last)])];
    }
    const direct = leaderPoints(card, node);
    if (direct.length < 2) return direct;
    const from = direct[0]!;
    const to = direct.at(-1)!;
    const router = (this.leaderRouter ??= createRouter({ clearance: 8 }));
    if (this.obstaclesDirty) {
      this.obstaclesDirty = false;
      const obstacles = new Map<string, Rect>();
      for (const n of this.diagram.store.nodes.values()) {
        obstacles.set(n.id, nodeBounds(n, this.diagram.symbols.get(n.type)));
      }
      router.setObstacles(obstacles);
    }
    try {
      const [r] = router.route([
        {
          linkId: `leader:${a.id}`,
          from: { point: from, direction: sideOf(card, from), nodeId: `leader:${a.id}` },
          to: { point: to, direction: sideOf(node, to), nodeId: anchor.id },
        },
      ]);
      return r && r.points.length >= 2 ? r.points : direct;
    } catch {
      return direct;
    }
  }

  // ---- element helpers -----------------------------------------------------

  private createTextItem(key: string, id: string): Item {
    const t = this.view.root.ownerDocument.createElementNS(SVG_NS, 'text');
    t.setAttribute('class', 'pv-annotation');
    t.dataset.annotationId = id;
    this.view.layers.annotations.append(t);
    const item: Item = { kind: 'annotation', id, el: t };
    this.items.set(key, item);
    return item;
  }

  private createHtmlItem(key: string, kind: Item['kind'], id: string, rendererName: string): Item {
    const el = this.view.root.ownerDocument.createElement('div');
    el.className = 'pv-overlay-item';
    el.style.position = 'absolute';
    el.style.left = '0';
    el.style.top = '0';
    if (kind === 'node') el.dataset.nodeId = id;
    else el.dataset.annotationId = id;
    this.view.overlay.append(el);
    const item: Item = { kind, id, el, rendererName };
    this.items.set(key, item);
    return item;
  }

  private place(
    el: HTMLElement,
    at: Point,
    size: { width: number; height: number } | undefined,
  ): void {
    const t = `translate(${at.x}px,${at.y}px)`;
    if (el.style.transform !== t) el.style.transform = t;
    if (size) {
      el.style.width = `${size.width}px`;
      el.style.height = `${size.height}px`;
    }
  }

  /**
   * HtmlRenderer contract: called once when the item appears and again with the same element on every
   * data/status change. The cleanup returned by the first call runs when the item is removed.
   */
  private callRenderer(item: Item, data: DataRecord | undefined, status: string | undefined): void {
    const name = item.rendererName!;
    const fn: HtmlRenderer | undefined = item.render ?? this.diagram.options.htmlRenderers?.[name];
    const el = item.el as HTMLElement;
    setStatus(el, status);
    if (!fn) {
      if (!this.warned.has(name)) {
        this.warned.add(name);
        console.warn(`[pipeline-view] No htmlRenderer registered under "${name}"`);
      }
      return;
    }
    const first = item.cleanup === undefined;
    const ret = fn(el, { kind: item.kind, id: item.id, data, status });
    if (first) item.cleanup = ret ?? (() => {});
  }

  private remove(key: string): void {
    const item = this.items.get(key);
    if (!item) return;
    this.items.delete(key);
    if (item.kind === 'annotation') {
      this.setAnchor(item.id, undefined);
      if (item.leader) this.leaderRouter?.removeRoutes([`leader:${item.id}`]);
    }
    if (item.resize) {
      item.resize.disconnect();
      if (item.kind === 'annotation') this.diagram.setAnnotationSize(item.id, null);
      // Drop the measurement unless the node is merely re-mounting under another renderer.
      else if (!this.diagram.store.nodes.has(item.id)) this.diagram.setMeasuredSize(item.id, null);
    }
    try {
      if (typeof item.cleanup === 'function') item.cleanup();
    } finally {
      item.el.remove();
      item.leader?.remove();
    }
  }

  destroy(): void {
    for (const u of this.unsubscribe) u();
    this.frame.cancel();
    for (const key of [...this.items.keys()]) this.remove(key);
  }
}

/** Draggable annotations are focusable (arrow keys move them) and named for screen readers. */
function setDraggable(el: Element, on: boolean, name: string): void {
  const attrs: [string, string][] = [
    ['data-draggable', ''],
    ['tabindex', '0'],
    ['role', 'group'],
    ['aria-roledescription', 'movable annotation'],
    ['aria-label', name],
  ];
  for (const [k, v] of attrs) {
    if (!on) el.removeAttribute(k);
    else if (el.getAttribute(k) !== v) el.setAttribute(k, v);
  }
}

function setStatus(el: Element, status: string | undefined): void {
  if (status) el.setAttribute('data-status', status);
  else el.removeAttribute('data-status');
}

function textBox(t: SVGTextElement, pos: Point): Rect {
  try {
    const b = t.getBBox();
    if (b.width > 0) return { x: b.x, y: b.y, width: b.width, height: b.height };
  } catch {
    /* not rendered, or no layout (SSR / tests) */
  }
  return { ...pos, width: 0, height: 0 };
}

/** The outward side of `box` that `p` lies on. */
function sideOf(box: Rect, p: Point): PortDirection {
  const d = [
    ['left', Math.abs(p.x - box.x)],
    ['right', Math.abs(p.x - (box.x + box.width))],
    ['top', Math.abs(p.y - box.y)],
    ['bottom', Math.abs(p.y - (box.y + box.height))],
  ] as const;
  return d.reduce((m, c) => (c[1] < m[1] ? c : m))[0];
}

/** The point on the edge of `box` that faces `p`, aligned with it when possible so the first segment is orthogonal. */
function edgeToward(box: Rect, p: Point): Point {
  const x2 = box.x + box.width;
  const y2 = box.y + box.height;
  if (p.x >= box.x && p.x <= x2) return { x: p.x, y: p.y < box.y ? box.y : y2 };
  if (p.y >= box.y && p.y <= y2) return { x: p.x < box.x ? box.x : x2, y: p.y };
  return { x: p.x < box.x ? box.x : x2, y: box.y + box.height / 2 };
}
