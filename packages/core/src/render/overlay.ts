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
import { nodeBounds } from '../diagram/geometry';
import { leaderPoints, linkPath } from './paths';

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
  leader?: SVGPathElement;
}

const aKey = (id: string) => `a\u0000${id}`;
const nKey = (id: string) => `n\u0000${id}`;

export class OverlayRenderer {
  private readonly items = new Map<string, Item>();
  private readonly dirty = new Set<string>();
  private full = true;
  private frame = 0;
  private readonly unsubscribe: (() => void)[] = [];
  private readonly warned = new Set<string>();

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
        for (const id of ids) this.markNode(id);
        this.schedule();
      }),
    );
    this.schedule();
  }

  private onModel(diff: ModelDiff): void {
    for (const id of [
      ...diff.added.annotations,
      ...diff.changed.annotations,
      ...diff.removed.annotations,
    ]) {
      this.dirty.add(aKey(id));
    }
    for (const id of [...diff.added.nodes, ...diff.changed.nodes, ...diff.removed.nodes])
      this.markNode(id);
    this.schedule();
  }

  /** A node change affects its own overlay and every annotation anchored to it. */
  private markNode(id: string): void {
    this.dirty.add(nKey(id));
    for (const [key, item] of this.items) {
      if (item.kind === 'annotation' && this.annotation(item.id)?.anchor?.node === id)
        this.dirty.add(key);
    }
    for (const a of this.diagram.store.annotationsOf(id)) this.dirty.add(aKey(a.id));
  }

  private schedule(): void {
    if (this.frame) return;
    const win = this.view.root.ownerDocument.defaultView;
    if (win?.requestAnimationFrame) this.frame = win.requestAnimationFrame(() => this.flush());
    else this.frame = setTimeout(() => this.flush(), 0) as unknown as number;
  }

  flush(): void {
    if (this.frame) {
      this.view.root.ownerDocument.defaultView?.cancelAnimationFrame?.(this.frame);
      clearTimeout(this.frame);
      this.frame = 0;
    }
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
      if (kind === 'n') this.upsertNode(id);
      else this.upsertAnnotation(id);
    }
    this.dirty.clear();
  }

  // ---- nodes with data.overlay ----------------------------------------------

  private upsertNode(id: string): void {
    const key = nKey(id);
    const n = this.diagram.store.nodes.get(id);
    const name = typeof n?.data?.overlay === 'string' ? n.data.overlay : undefined;
    const existing = this.items.get(key);
    if (!n || !name) {
      if (existing) this.remove(key);
      return;
    }
    if (existing && existing.rendererName !== name) this.remove(key);
    const item = this.items.get(key) ?? this.createHtmlItem(key, 'node', id, name);
    const b = nodeBounds(n, this.diagram.symbols.get(n.type));
    this.place(item.el as HTMLElement, b, { width: b.width, height: b.height });
    if (item.source !== n) {
      item.source = n;
      this.callRenderer(item, n.data, n.status);
    }
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
    const anchor = a.anchor ? this.diagram.store.nodes.get(a.anchor.node) : undefined;
    const pos: Point = {
      x: a.position.x + (anchor?.position.x ?? 0),
      y: a.position.y + (anchor?.position.y ?? 0),
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
      box = textBox(t, pos);
    } else {
      item ??= this.createHtmlItem(key, 'annotation', id, a.renderer);
      const el = item.el as HTMLElement;
      this.place(el, pos, a.size);
      if (item.source !== a || item.anchorSource !== anchor) {
        item.source = a;
        item.anchorSource = anchor;
        const data: DataRecord | undefined = anchor ? { ...anchor.data, ...a.data } : a.data;
        this.callRenderer(item, data, a.status ?? anchor?.status);
      }
      box = {
        ...pos,
        width: a.size?.width ?? el.offsetWidth ?? 0,
        height: a.size?.height ?? el.offsetHeight ?? 0,
      };
    }
    this.drawLeader(item, a, anchor, box);
  }

  private drawLeader(
    item: Item,
    a: AnnotationModel,
    anchor: NodeModel | undefined,
    box: Rect,
  ): void {
    const points =
      a.leader && anchor
        ? leaderPoints(box, nodeBounds(anchor, this.diagram.symbols.get(anchor.type)))
        : [];
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
    const fn: HtmlRenderer | undefined = this.diagram.options.htmlRenderers?.[name];
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
    try {
      if (typeof item.cleanup === 'function') item.cleanup();
    } finally {
      item.el.remove();
      item.leader?.remove();
    }
  }

  destroy(): void {
    for (const u of this.unsubscribe) u();
    if (this.frame) {
      this.view.root.ownerDocument.defaultView?.cancelAnimationFrame?.(this.frame);
      clearTimeout(this.frame);
    }
    for (const key of [...this.items.keys()]) this.remove(key);
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
