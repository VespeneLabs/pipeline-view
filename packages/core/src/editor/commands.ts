/**
 * Editor commands (FR-24..29). DOM-free: the pointer/keyboard controller translates gestures into
 * these calls. Every edit goes through `update()` (one undo step), or through `preview()` +
 * `commitPreview()` for drags, which also yields exactly one undo step.
 */
import type { Diagram } from '../diagram/diagram';
import { nodePorts, nodeSize, previewNode } from '../symbols/resolve';
import type { ConnectResult, ItemRef, Transaction } from '../diagram/types';
import {
  type ConnectCheck,
  type ConnectIndexes,
  connectIndexes,
  connectLink,
  validateConnect,
} from '../diagram/validate';
import type { AnnotationModel, LinkEnd, LinkModel, NodeModel, Point, Rect } from '../model/types';
import type { PortDirection } from '../symbols/types';
import { type Guide, alignmentSnap, snapPoint } from './guides';
import { adjustWaypoints, toWaypoints } from './waypoints';

/** Geometry the editor needs from the renderer layer (implemented with diagram/geometry). */
export interface EditorGeometry {
  /** Axis-aligned bounds after rotation, in diagram coordinates. */
  bounds(node: NodeModel): Rect;
  /** Port location and direction after rotation and flip, or undefined for an unknown port. */
  port(node: NodeModel, portId: string): { point: Point; direction: PortDirection } | undefined;
}

/** Result of `checkDrop`. */
export type DropCheck =
  | { ok: true; position: Point }
  | { ok: false; code: string; reason: string; detail?: Record<string, unknown> };

export interface Clipboard {
  nodes: NodeModel[];
  links: LinkModel[];
  annotations: AnnotationModel[];
}

export interface MoveOptions {
  /** Snap the lead node's position to the grid (defaults to `options.grid.snap`). */
  snap?: boolean;
  /** Distance in diagram units within which alignment guides snap. 0 disables guides. Default 6. */
  guideThreshold?: number;
}

interface MoveSession {
  ids: string[];
  start: Map<string, Point>;
  lead: string;
  others: Rect[];
  linkBase: Map<string, Point[]>;
}

const clone = <T>(v: T): T => structuredClone(v);
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });

export class EditorCommands {
  private move: MoveSession | null = null;

  constructor(
    readonly diagram: Diagram,
    readonly geometry: EditorGeometry,
  ) {}

  private get store() {
    return this.diagram.store;
  }

  private get gridSize(): number {
    return this.diagram.options.grid?.size ?? 10;
  }

  // ------------------------------------------------------------------ selection

  selectAll(): void {
    this.diagram.setSelection([
      ...[...this.store.nodes.keys()].map((id) => ({ kind: 'node', id }) as const),
      ...[...this.store.links.keys()].map((id) => ({ kind: 'link', id }) as const),
    ]);
  }

  /** Node ids whose bounds intersect `rect` (marquee selection). */
  nodesInRect(rect: Rect): string[] {
    const out: string[] = [];
    for (const n of this.store.nodes.values()) {
      const b = this.geometry.bounds(n);
      if (
        b.x < rect.x + rect.width &&
        rect.x < b.x + b.width &&
        b.y < rect.y + rect.height &&
        rect.y < b.y + b.height
      ) {
        out.push(n.id);
      }
    }
    return out;
  }

  /** Locked items can't be moved, deleted, transformed or re-routed in edit mode (FR-43). */
  private isLocked(kind: 'node' | 'link', id: string): boolean {
    return kind === 'node'
      ? !!this.store.nodes.get(id)?.locked
      : !!this.store.links.get(id)?.locked;
  }

  private unlockedNodes(ids: string[]): string[] {
    return ids.filter((id) => !this.isLocked('node', id));
  }

  private selectedNodeIds(): string[] {
    return this.diagram
      .getSelection()
      .filter((r) => r.kind === 'node')
      .map((r) => r.id);
  }

  // ------------------------------------------------------------------ move

  /** Moves nodes by `delta` as one undo step (keyboard nudge). */
  moveBy(ids: string[], delta: Point): void {
    ids = this.unlockedNodes(ids);
    if (!ids.length) return;
    const start = new Map(ids.map((id) => [id, this.store.nodes.get(id)!.position]));
    const base = this.manualLinkBase(ids);
    this.diagram.update((tx) => this.applyMove(tx, ids, start, delta, base));
  }

  /** Starts a drag of `ids` (defaults to the selected nodes). `lead` is the node under the pointer. */
  beginMove(ids = this.selectedNodeIds(), lead = ids[0]): void {
    if (this.move) this.cancelMove();
    const valid = this.unlockedNodes(ids).filter((id) => this.store.nodes.has(id));
    if (!valid.length || !lead) return;
    const moving = new Set(valid);
    const others: Rect[] = [];
    for (const n of this.store.nodes.values())
      if (!moving.has(n.id)) others.push(this.geometry.bounds(n));
    this.move = {
      ids: valid,
      start: new Map(valid.map((id) => [id, { ...this.store.nodes.get(id)!.position }])),
      lead,
      others,
      linkBase: this.manualLinkBase(valid),
    };
  }

  /** Updates the drag with the total pointer offset since `beginMove`. Returns the guides to draw. */
  dragMove(rawDelta: Point, opts: MoveOptions = {}): Guide[] {
    const s = this.move;
    if (!s) return [];
    let delta = rawDelta;
    const leadStart = s.start.get(s.lead) ?? s.start.values().next().value!;
    if (opts.snap ?? this.diagram.options.grid?.snap) {
      const snapped = snapPoint(add(leadStart, rawDelta), this.gridSize);
      delta = { x: snapped.x - leadStart.x, y: snapped.y - leadStart.y };
    }
    let guides: Guide[] = [];
    const threshold = opts.guideThreshold ?? 6;
    if (threshold > 0 && s.others.length) {
      const bounds = this.unionBounds(s, rawDelta);
      const a = alignmentSnap(bounds, s.others, threshold);
      // Guides win over the grid on the axis they snap.
      if (a.guides.some((g) => g.orientation === 'vertical'))
        delta = { ...delta, x: rawDelta.x + a.dx };
      if (a.guides.some((g) => g.orientation === 'horizontal'))
        delta = { ...delta, y: rawDelta.y + a.dy };
      guides = a.guides;
    }
    this.diagram.preview((tx) => this.applyMove(tx, s.ids, s.start, delta, s.linkBase));
    return guides;
  }

  endMove(): void {
    if (!this.move) return;
    this.move = null;
    this.diagram.commitPreview();
  }

  cancelMove(): void {
    if (!this.move) return;
    this.move = null;
    this.diagram.cancelPreview();
  }

  private unionBounds(s: MoveSession, delta: Point): Rect {
    let l = Infinity;
    let t = Infinity;
    let r = -Infinity;
    let b = -Infinity;
    for (const id of s.ids) {
      const node = this.store.nodes.get(id)!;
      const box = this.geometry.bounds({ ...node, position: add(s.start.get(id)!, delta) });
      l = Math.min(l, box.x);
      t = Math.min(t, box.y);
      r = Math.max(r, box.x + box.width);
      b = Math.max(b, box.y + box.height);
    }
    return { x: l, y: t, width: r - l, height: b - t };
  }

  /** Waypoints of the manual links attached to `ids`, as the base for moving them. */
  private manualLinkBase(ids: string[]): Map<string, Point[]> {
    const moving = new Set(ids);
    const out = new Map<string, Point[]>();
    for (const l of this.store.links.values()) {
      if (l.routing !== 'manual' || !l.waypoints?.length) continue;
      if (moving.has(l.from.node) || moving.has(l.to.node)) out.set(l.id, clone(l.waypoints));
    }
    return out;
  }

  /**
   * Sets each node to start + delta and keeps attached manual links orthogonal: links with both ends
   * moving translate their waypoints, links with one moving end slide their end waypoints.
   * `base` holds those links' waypoints at `start`.
   */
  private applyMove(
    tx: Transaction,
    ids: string[],
    start: Map<string, Point>,
    delta: Point,
    base: Map<string, Point[]>,
  ): void {
    const moving = new Set(ids);
    for (const id of ids) tx.updateNode(id, { position: add(start.get(id)!, delta) });
    for (const [linkId, wps] of base) {
      const link = this.store.links.get(linkId);
      if (!link) continue;
      if (moving.has(link.from.node) && moving.has(link.to.node)) {
        tx.updateLink(linkId, { waypoints: wps.map((p) => add(p, delta)) });
        continue;
      }
      const at = (end: LinkEnd, d: Point): Point => {
        const node = this.store.nodes.get(end.node)!;
        const pos = moving.has(end.node) ? add(start.get(end.node)!, d) : node.position;
        return this.geometry.port({ ...node, position: pos }, end.port)?.point ?? pos;
      };
      const zero = { x: 0, y: 0 };
      tx.updateLink(linkId, {
        waypoints: adjustWaypoints(
          wps,
          at(link.from, zero),
          at(link.from, delta),
          at(link.to, zero),
          at(link.to, delta),
        ),
      });
    }
  }

  // ------------------------------------------------------------------ rotate / flip

  /** Rotates nodes clockwise by `step` degrees (a multiple of 90) around their centers. */
  rotate(ids = this.selectedNodeIds(), step: 90 | -90 | 180 = 90): void {
    this.transformNodes(ids, (n) => ({
      rotation: (((((n.rotation ?? 0) + step) % 360) + 360) % 360) as NodeModel['rotation'],
    }));
  }

  flip(ids = this.selectedNodeIds(), axis: 'x' | 'y' = 'x'): void {
    this.transformNodes(ids, (n) =>
      axis === 'x' ? { flipX: !n.flipX || undefined } : { flipY: !n.flipY || undefined },
    );
  }

  /**
   * Applies a rotation/flip patch. Ports move, so manual links attached to these nodes go back to
   * auto routing and lose their waypoints (in the same undo step, so undo restores them).
   */
  private transformNodes(ids: string[], patch: (n: NodeModel) => Partial<NodeModel>): void {
    const nodes = this.unlockedNodes(ids)
      .map((id) => this.store.nodes.get(id))
      .filter((n): n is NodeModel => !!n);
    if (!nodes.length) return;
    const set = new Set(nodes.map((n) => n.id));
    this.diagram.update((tx) => {
      for (const n of nodes) tx.updateNode(n.id, patch(n));
      for (const l of this.store.links.values()) {
        if (l.routing === 'manual' && (set.has(l.from.node) || set.has(l.to.node))) {
          tx.updateLink(l.id, { routing: undefined, waypoints: undefined });
        }
      }
    });
  }

  // ------------------------------------------------------------------ delete / clipboard

  deleteItems(items = this.diagram.getSelection()): void {
    // Locked items stay, and so does a node whose cascade would remove a locked link.
    items = items.filter((r) => {
      if (r.kind === 'annotation') return true;
      if (this.isLocked(r.kind, r.id)) return false;
      return r.kind !== 'node' || !this.store.linksOf(r.id).some((l) => l.locked);
    });
    if (!items.length) return;
    this.diagram.update((tx) => {
      for (const r of items)
        if (r.kind === 'node' && this.store.nodes.has(r.id)) tx.removeNode(r.id);
      for (const r of items)
        if (r.kind === 'link' && this.store.links.has(r.id)) tx.removeLink(r.id);
      for (const r of items) {
        if (r.kind === 'annotation' && this.store.annotations.has(r.id)) tx.removeAnnotation(r.id);
      }
    });
  }

  /** Copies nodes, links between copied nodes, and annotations (selected or anchored to copied nodes). */
  copy(items = this.diagram.getSelection()): Clipboard {
    const nodeIds = new Set(items.filter((r) => r.kind === 'node').map((r) => r.id));
    const annIds = new Set(items.filter((r) => r.kind === 'annotation').map((r) => r.id));
    const nodes = [...nodeIds]
      .map((id) => this.store.nodes.get(id))
      .filter((n): n is NodeModel => !!n);
    const links = [...this.store.links.values()].filter(
      (l) => nodeIds.has(l.from.node) && nodeIds.has(l.to.node),
    );
    // Anchored annotations only travel with their node; free ones only when selected.
    const annotations = [...this.store.annotations.values()].filter((a) =>
      a.anchor ? nodeIds.has(a.anchor.node) : annIds.has(a.id),
    );
    return clone({ nodes, links, annotations });
  }

  cut(items = this.diagram.getSelection()): Clipboard {
    const clip = this.copy(items);
    this.deleteItems(items);
    return clip;
  }

  /** Pastes with fresh ids, offset by `offset`, as one undo step. Selects and returns the pasted items. */
  paste(
    clip: Clipboard,
    offset: Point = { x: this.gridSize * 2, y: this.gridSize * 2 },
  ): ItemRef[] {
    const ids = new Map<string, string>();
    const taken = new Set<string>();
    const fresh = (old: string, existing: Map<string, unknown>) => {
      const id = uniqueId(old.replace(/_\d+$/, ''), (c) => existing.has(c) || taken.has(c));
      taken.add(id);
      return id;
    };
    const out: ItemRef[] = [];
    this.diagram.update((tx) => {
      for (const n of clip.nodes) {
        const id = fresh(n.id, this.store.nodes);
        ids.set(n.id, id);
        tx.addNode({ ...clone(n), id, position: add(n.position, offset) });
        out.push({ kind: 'node', id });
      }
      for (const l of clip.links) {
        const from = ids.get(l.from.node);
        const to = ids.get(l.to.node);
        if (!from || !to) continue;
        const id = fresh(l.id, this.store.links);
        const link: LinkModel = {
          ...clone(l),
          id,
          from: { ...l.from, node: from },
          to: { ...l.to, node: to },
        };
        if (l.waypoints) link.waypoints = l.waypoints.map((p) => add(p, offset));
        tx.addLink(link);
        out.push({ kind: 'link', id });
      }
      for (const a of clip.annotations) {
        const id = fresh(a.id, this.store.annotations);
        const anchorNode = a.anchor ? ids.get(a.anchor.node) : undefined;
        if (a.anchor && !anchorNode) continue;
        const ann = { ...clone(a), id } as AnnotationModel;
        if (anchorNode) ann.anchor = { node: anchorNode };
        else ann.position = add(a.position, offset);
        tx.addAnnotation(ann);
        out.push({ kind: 'annotation', id });
      }
    });
    this.diagram.setSelection(out);
    return out;
  }

  duplicate(items = this.diagram.getSelection()): ItemRef[] {
    return this.paste(this.copy(items));
  }

  // ------------------------------------------------------------------ connect

  /** True when a link of `kind` may join the two ports. `checkConnect` explains a refusal. */
  canConnect(from: LinkEnd, to: LinkEnd, kind = 'process'): boolean {
    return validateConnect(this.diagram, from, to, kind).ok;
  }

  /**
   * Validates a connection with every rule (roles, limits, direction, host hook) and explains a refusal
   * (FR-41, FR-42). An allowed result carries the ends in flow order.
   */
  checkConnect(
    from: LinkEnd,
    to: LinkEnd,
    kind = 'process',
    indexes?: ConnectIndexes,
  ): ConnectCheck {
    return validateConnect(this.diagram, from, to, kind, indexes);
  }

  /** Indexes for checking many candidates during one gesture (see `checkConnect`). */
  connectIndexes(): ConnectIndexes {
    return connectIndexes(this.diagram);
  }

  /** Every port a link of `kind` starting at `from` may connect to (for highlighting). */
  compatiblePorts(from: LinkEnd, kind = 'process'): LinkEnd[] {
    return this.portChecks(from, kind)
      .filter((c) => c.check.ok)
      .map((c) => c.to);
  }

  /** Every other port with its check result, so refused ones can be marked with their reason. */
  portChecks(from: LinkEnd, kind = 'process'): { to: LinkEnd; check: ConnectCheck }[] {
    const indexes = this.connectIndexes();
    const out: { to: LinkEnd; check: ConnectCheck }[] = [];
    for (const n of this.store.nodes.values()) {
      for (const p of nodePorts(this.diagram.symbols.get(n.type), n)) {
        const to = { node: n.id, port: p.id };
        if (to.node === from.node && to.port === from.port) continue;
        out.push({ to, check: validateConnect(this.diagram, from, to, kind, indexes) });
      }
    }
    return out;
  }

  /** Creates a link if allowed (in flow order) and selects it. Returns its id, or the refusal (FR-54). */
  tryConnect(from: LinkEnd, to: LinkEnd, kind = 'process'): ConnectResult {
    const r = connectLink(this.diagram, from, to, kind);
    if (r.ok) this.diagram.setSelection([{ kind: 'link', id: r.id }]);
    return r;
  }

  /** Creates a link if allowed and returns its id, or null. See `tryConnect` for the reason. */
  connect(from: LinkEnd, to: LinkEnd, kind = 'process'): string | null {
    const r = this.tryConnect(from, to, kind);
    return r.ok ? r.id : null;
  }

  // ------------------------------------------------------------------ links

  /** Stores a user-edited path (full polyline, ports included) and switches the link to manual routing. */
  setLinkPath(linkId: string, path: Point[]): void {
    if (!this.store.links.has(linkId) || this.isLocked('link', linkId)) return;
    const waypoints = toWaypoints(path);
    this.diagram.update((tx) => tx.updateLink(linkId, { routing: 'manual', waypoints }));
  }

  /** Previews a path while the user drags a segment. Finish with `commitLinkPath` or `cancelLinkPath`. */
  previewLinkPath(linkId: string, path: Point[]): void {
    if (!this.store.links.has(linkId) || this.isLocked('link', linkId)) return;
    const waypoints = toWaypoints(path);
    this.diagram.preview((tx) => tx.updateLink(linkId, { routing: 'manual', waypoints }));
  }

  commitLinkPath(): void {
    this.diagram.commitPreview();
  }

  cancelLinkPath(): void {
    this.diagram.cancelPreview();
  }

  /** Drops the manual waypoints and lets the router take over again. */
  resetRouting(linkId: string): void {
    if (!this.store.links.has(linkId) || this.isLocked('link', linkId)) return;
    this.diagram.update((tx) =>
      tx.updateLink(linkId, { routing: undefined, waypoints: undefined }),
    );
  }

  // ------------------------------------------------------------------ drop / label

  /**
   * Where a node of `type` dropped at `point` would go (centred, grid-snapped), or why it can't go there:
   * `canDrop(type, topLeft)` can refuse with a reason (FR-42). Used for drops and the placement preview.
   */
  checkDrop(
    type: string,
    point: Point,
    init: Partial<Omit<NodeModel, 'id' | 'type' | 'position'>> = {},
  ): DropCheck {
    const def = this.diagram.symbols.get(type);
    if (!def) return { ok: false, code: 'unknown-symbol', reason: `Unknown symbol "${type}".` };
    const size = nodeSize(def, { ...previewNode(def), ...init } as NodeModel);
    let position = { x: point.x - size.width / 2, y: point.y - size.height / 2 };
    if (this.diagram.options.grid?.snap) position = snapPoint(position, this.gridSize);
    const r = this.diagram.options.canDrop?.(type, position) ?? true;
    if (r === true) return { ok: true, position };
    if (r === false)
      return { ok: false, code: 'refused', reason: 'This symbol cannot be placed here.' };
    return {
      ok: false,
      code: r.code ?? 'refused',
      reason: r.reason,
      ...(r.detail ? { detail: r.detail } : {}),
    };
  }

  /** Adds a node of `type` centred on `point` (palette drop) if allowed, and selects it. */
  tryDrop(
    type: string,
    point: Point,
    init: Partial<Omit<NodeModel, 'id' | 'type' | 'position'>> = {},
  ): ConnectResult {
    const check = this.checkDrop(type, point, init);
    if (!check.ok) return check;
    const base = type.slice(type.lastIndexOf('/') + 1);
    const id = uniqueId(base, (c) => this.store.nodes.has(c));
    const position = check.position;
    this.diagram.update((tx) => tx.addNode({ ...clone(init), id, type, position }));
    this.diagram.setSelection([{ kind: 'node', id }]);
    return { ok: true, id };
  }

  /**
   * Adds a node built by a host drop source (FR-50) at its own position, if `canDrop` allows it. A taken
   * id gets a `_N` suffix. Selects the node.
   */
  tryPlaceNode(node: NodeModel): ConnectResult {
    const r = this.diagram.options.canDrop?.(node.type, node.position) ?? true;
    if (r !== true) {
      return r === false
        ? { ok: false, code: 'refused', reason: 'This symbol cannot be placed here.' }
        : {
            ok: false,
            code: r.code ?? 'refused',
            reason: r.reason,
            ...(r.detail ? { detail: r.detail } : {}),
          };
    }
    const id = this.store.nodes.has(node.id)
      ? uniqueId(node.id.replace(/_\d+$/, ''), (c) => this.store.nodes.has(c))
      : node.id;
    this.diagram.update((tx) => tx.addNode({ ...clone(node), id }));
    this.diagram.setSelection([{ kind: 'node', id }]);
    return { ok: true, id };
  }

  /** Like `tryDrop`, returning the new id or null. */
  drop(
    type: string,
    point: Point,
    init: Partial<Omit<NodeModel, 'id' | 'type' | 'position'>> = {},
  ): string | null {
    const r = this.tryDrop(type, point, init);
    return r.ok ? r.id : null;
  }

  /** Sets a node label. An empty string removes it. */
  setLabel(nodeId: string, label: string): void {
    const node = this.store.nodes.get(nodeId);
    if (!node) return;
    const next = label.trim() === '' ? undefined : label;
    if (next === node.label) return;
    this.diagram.update((tx) => tx.updateNode(nodeId, { label: next }));
  }
}

/** `base_1`, `base_2`, ... : the first candidate that `taken` rejects is skipped. */
export function uniqueId(base: string, taken: (id: string) => boolean): string {
  for (let i = 1; ; i++) {
    const id = `${base}_${i}`;
    if (!taken(id)) return id;
  }
}
