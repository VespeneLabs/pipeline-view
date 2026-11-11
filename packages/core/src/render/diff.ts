/**
 * Shows how the diagram differs from a base model (FR-51), for reviewing a change before saving it or
 * comparing two saved versions.
 *
 * - Current nodes and links get `data-diff="added" | "moved" | "changed"`. Marked nodes also get an outline
 *   in the diff layer, so the mark shows whatever the symbol's colours are.
 * - Items only in the base are drawn as faded ghosts (`data-diff="removed"`): nodes with their symbol,
 *   links as an orthogonal path through their base port points and waypoints.
 *
 * The marks follow edits while a comparison is shown. They're view state: never saved, never exported.
 */
import type { Diagram } from '../diagram/diagram';
import type { DiffMark } from '../diagram/types';
import { nodeBounds, nodeTransform, portPoint } from '../diagram/geometry';
import { orientationKey, uprightTexts } from './upright';
import { getDiff, type GetDiffOptions } from '../model/compare';
import type { DiagramModel, LinkModel, NodeModel, Point } from '../model/types';
import { nodeSize } from '../symbols/resolve';
import type { View } from '../viewport/view';
import { FrameTask } from './frame';

const SVG_NS = 'http://www.w3.org/2000/svg';
const OUTLINE_PAD = 6;

export class DiffLayer {
  private base: DiagramModel | null = null;
  private opts: GetDiffOptions = {};
  private readonly layer: SVGGElement;
  private readonly marked = new Set<Element>();
  private readonly frame: FrameTask;
  private readonly cleanup: (() => void)[] = [];

  constructor(
    private readonly diagram: Diagram,
    private readonly view: View,
  ) {
    const doc = view.root.ownerDocument;
    this.layer = doc.createElementNS(SVG_NS, 'g');
    this.layer.setAttribute('class', 'pv-layer-diff');
    // Below the links, so ghosts and outlines never cover live items.
    view.layers.leaders.before(this.layer);
    this.frame = new FrameTask(
      () => view.root.ownerDocument.defaultView,
      () => this.flush(),
    );
    const i = diagram.internal;
    this.cleanup.push(
      i.on('load', () => this.schedule()),
      i.on('model', () => this.schedule()),
      // Measured HTML node sizes (FR-45) move node bounds without a model change.
      i.on('geometry', () => this.schedule()),
    );
  }

  /** Compares against `base`, or clears the comparison with null. */
  set(base: DiagramModel | null, opts: GetDiffOptions = {}): void {
    this.base = base;
    this.opts = opts;
    this.schedule();
  }

  private schedule(): void {
    if (this.base || this.marked.size || this.layer.firstChild) this.frame.schedule();
  }

  /** Applies the marks now. Renders pending model changes first. */
  flush(): void {
    this.frame.cancel();
    this.diagram.renderer?.flush();
    for (const el of this.marked) el.removeAttribute('data-diff');
    this.marked.clear();
    this.layer.replaceChildren();
    const base = this.base;
    if (!base) return;
    const current = this.diagram.toJSON();
    const diff = getDiff(base, current, this.opts);
    const baseNodes = new Map(base.nodes.map((n) => [n.id, n]));
    const baseLinks = new Map(base.links.map((l) => [l.id, l]));
    const ghosts: SVGElement[] = [];
    const outlines: SVGElement[] = [];
    for (const { id, mark } of diff.nodes) {
      if (mark === 'removed') {
        const n = baseNodes.get(id);
        if (n) ghosts.push(this.ghostNode(n));
        continue;
      }
      const el = this.mark(this.view.layers.nodes, 'data-node-id', id, mark);
      const n = this.diagram.store.nodes.get(id);
      if (n) outlines.push(this.outline(n, mark, el));
    }
    for (const { id, mark } of diff.links) {
      if (mark === 'removed') {
        const l = baseLinks.get(id);
        const path = l && this.ghostPath(l, baseNodes);
        if (path) ghosts.push(path);
        continue;
      }
      this.mark(this.view.layers.links, 'data-link-id', id, mark);
    }
    // Ghost links under ghost nodes, outlines on top of both.
    ghosts.sort((a, b) => Number(a.tagName === 'g') - Number(b.tagName === 'g'));
    this.layer.append(...ghosts, ...outlines);
  }

  private mark(layer: Element, attr: string, id: string, mark: DiffMark): Element | null {
    const el = layer.querySelector(`[${attr}="${id.replace(/["\\]/g, '\\$&')}"]`);
    if (!el) return null;
    el.setAttribute('data-diff', mark);
    this.marked.add(el);
    return el;
  }

  private svg(tag: string, attrs: Record<string, string | number>): SVGElement {
    const el = this.view.root.ownerDocument.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    return el;
  }

  /** Around the node as rendered (label included) when layout is available, else its symbol bounds. */
  private outline(n: NodeModel, mark: DiffMark, el: Element | null): SVGElement {
    let b = nodeBounds(n, this.diagram.symbols.get(n.type));
    try {
      const r = (el as SVGGraphicsElement | null)?.getBBox();
      if (r && r.width > 0) b = { x: r.x, y: r.y, width: r.width, height: r.height };
    } catch {
      /* no layout (SSR / tests) */
    }
    return this.svg('rect', {
      class: 'pv-diff-outline',
      'data-diff': mark,
      'data-diff-node': n.id,
      x: b.x - OUTLINE_PAD,
      y: b.y - OUTLINE_PAD,
      width: b.width + 2 * OUTLINE_PAD,
      height: b.height + 2 * OUTLINE_PAD,
    });
  }

  private ghostNode(n: NodeModel): SVGElement {
    const def = this.diagram.symbols.get(n.type);
    const g = this.svg('g', {
      class: 'pv-diff-ghost',
      'data-diff': 'removed',
      'data-diff-node': n.id,
      transform: nodeTransform(n, def),
    });
    const { width, height } = nodeSize(def, n);
    const body = this.svg('g', { class: 'pv-symbol' });
    // Symbol markup comes from registered symbol definitions, the same source the renderer uses.
    body.innerHTML = def
      ? (def.render?.({ data: n.data ?? {}, label: n.label, status: n.status }) ?? def.svg ?? '')
      : `<rect width="${width}" height="${height}" fill="none" stroke="currentColor" stroke-dasharray="4 4"/>`;
    if (def?.uprightText !== false && orientationKey(n)) uprightTexts(body, n);
    g.append(body);
    if (n.label) {
      const title = this.svg('title', {});
      title.textContent = `Removed: ${n.label}`;
      g.append(title);
    }
    return g;
  }

  private ghostPath(l: LinkModel, baseNodes: Map<string, NodeModel>): SVGElement | null {
    const end = (e: LinkModel['from']) => {
      const n = baseNodes.get(e.node) ?? this.diagram.store.nodes.get(e.node);
      return n && portPoint(n, this.diagram.symbols.get(n.type), e.port)?.point;
    };
    const a = end(l.from);
    const b = end(l.to);
    if (!a || !b) return null;
    const pts = orthogonal([a, ...(l.waypoints ?? []), b]);
    return this.svg('path', {
      class: 'pv-diff-ghost-link',
      'data-diff': 'removed',
      'data-diff-link': l.id,
      'data-kind': l.kind,
      d: pts.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(''),
    });
  }

  destroy(): void {
    this.frame.cancel();
    for (const c of this.cleanup) c();
    for (const el of this.marked) el.removeAttribute('data-diff');
    this.layer.remove();
  }
}

/** Inserts an elbow between points that aren't axis-aligned (horizontal first). */
export function orthogonal(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const prev = out.at(-1);
    if (prev && prev.x !== p.x && prev.y !== p.y) out.push({ x: p.x, y: prev.y });
    out.push(p);
  }
  return out;
}
