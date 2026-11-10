/**
 * Problem markers (FR-48). Issues are view state: validation results or server save errors that the
 * host computes. They're never part of the saved model.
 *
 * For each node or link that has issues:
 * - a badge is drawn in its own layer above the nodes: at a node's top-right corner, or at the middle
 *   of a link's route. The badge shows an icon for the worst severity, and its SVG <title> is the tooltip;
 * - `data-issue-severity` on the item's element carries the worst severity, for styling;
 * - `aria-description` lists the messages, so screen readers read them after the item's label.
 *
 * Badges follow moves and re-routes. They're left out of exportSVG(), like other interaction chrome.
 */
import type { Diagram } from '../diagram/diagram';
import type { Issue, IssueMap, ItemRef } from '../diagram/types';
import type { Point } from '../model/types';
import type { View } from '../viewport/view';
import { FrameTask } from './frame';

const SVG_NS = 'http://www.w3.org/2000/svg';
const RANK = { error: 3, warning: 2, info: 1 } as const;
export type IssueSeverity = Issue['severity'];

/** Badge radius in diagram units. */
const R = 8;
const GLYPHS: Record<IssueSeverity, string> = {
  // "!" for errors and warnings, "i" for info. Drawn as strokes, coloured by --pv-issue-ink.
  error: 'M0 -4.2V1M0 4.2V4.3',
  warning: 'M0 -4.2V1M0 4.2V4.3',
  info: 'M0 -4.3V-4.2M0 -1V4.2',
};

/** The worst severity in a list, or undefined if it's empty. */
export function worstSeverity(issues: readonly Issue[] | undefined): IssueSeverity | undefined {
  let worst: IssueSeverity | undefined;
  for (const i of issues ?? []) if (!worst || RANK[i.severity] > RANK[worst]) worst = i.severity;
  return worst;
}

/** "Error: Pressure too high. Warning: No outlet." in severity order. */
export function describeIssues(issues: readonly Issue[]): string {
  return [...issues]
    .sort((a, b) => RANK[b.severity] - RANK[a.severity])
    .map((i) => `${i.severity[0]!.toUpperCase()}${i.severity.slice(1)}: ${i.message}`)
    .join(' ');
}

/** The point halfway along a polyline. */
export function polylineMidpoint(points: readonly Point[]): Point | undefined {
  if (points.length === 0) return undefined;
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1]!, points[i]!);
  let left = total / 2;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const d = dist(a, b);
    if (d >= left && d > 0)
      return { x: a.x + ((b.x - a.x) * left) / d, y: a.y + ((b.y - a.y) * left) / d };
    left -= d;
  }
  return points[0];
}

interface Marked {
  item: ItemRef;
  issues: Issue[];
}

export class IssueLayer {
  private map = new Map<string, Marked>();
  private readonly layer: SVGGElement;
  private readonly badges = new Map<string, SVGGElement>();
  /** Elements that got attributes from us, so they can be cleaned when the issues go away. */
  private readonly marked = new Map<string, Element>();
  private readonly frame: FrameTask;
  private readonly cleanup: (() => void)[] = [];

  constructor(
    private readonly diagram: Diagram,
    private readonly view: View,
  ) {
    const doc = view.root.ownerDocument;
    this.layer = doc.createElementNS(SVG_NS, 'g');
    this.layer.setAttribute('class', 'pv-layer-issues');
    view.layers.annotations.after(this.layer);
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

  /** Replaces all issues. Items with an empty list (or missing from the map) are cleared. */
  set(issues: IssueMap): void {
    const next = new Map<string, Marked>();
    for (const [kind, byId] of [
      ['node', issues.nodes],
      ['link', issues.links],
    ] as const) {
      for (const [id, list] of Object.entries(byId ?? {})) {
        if (list?.length) next.set(key(kind, id), { item: { kind, id }, issues: [...list] });
      }
    }
    this.map = next;
    this.schedule();
  }

  get(): IssueMap {
    const out: Required<IssueMap> = { nodes: {}, links: {} };
    for (const { item, issues } of this.map.values()) {
      (item.kind === 'node' ? out.nodes : out.links)[item.id] = [...issues];
    }
    return out;
  }

  issuesOf(item: ItemRef): readonly Issue[] {
    return this.map.get(key(item.kind, item.id))?.issues ?? [];
  }

  /** Marked items that exist in the model, in reading order (top to bottom, then left to right). */
  items(): ItemRef[] {
    const d = this.diagram;
    return [...this.map.values()]
      .map((m) => m.item)
      .filter((it) => (it.kind === 'node' ? d.store.nodes.has(it.id) : d.store.links.has(it.id)))
      .map((item) => ({ item, at: this.anchor(item) ?? { x: Infinity, y: Infinity } }))
      .sort((a, b) => a.at.y - b.at.y || a.at.x - b.at.x)
      .map((x) => x.item);
  }

  private schedule(): void {
    this.frame.schedule();
  }

  /** Applies attributes and badge positions now. Renders pending model changes first. */
  flush(): void {
    this.frame.cancel();
    this.diagram.renderer?.flush();
    const live = new Set<string>();
    for (const [k, { item, issues }] of this.map) {
      const el = this.elementOf(item);
      const at = this.anchor(item);
      if (!el || !at) continue;
      live.add(k);
      const severity = worstSeverity(issues)!;
      const description = describeIssues(issues);
      const prev = this.marked.get(k);
      if (prev && prev !== el) clearAttrs(prev);
      this.marked.set(k, el);
      setAttr(el, 'data-issue-severity', severity);
      setAttr(el, 'aria-description', description);
      this.badge(k, item, severity, description, at);
    }
    for (const [k, el] of this.marked) {
      if (live.has(k)) continue;
      clearAttrs(el);
      this.marked.delete(k);
    }
    for (const [k, b] of this.badges) {
      if (live.has(k)) continue;
      b.remove();
      this.badges.delete(k);
    }
  }

  private badge(k: string, item: ItemRef, severity: IssueSeverity, text: string, at: Point): void {
    let g = this.badges.get(k);
    const doc = this.view.root.ownerDocument;
    if (!g) {
      g = doc.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'pv-issue-badge');
      // Ties the badge to its item, for hosts and tests. Clicking it selects the item (see hitTest).
      g.setAttribute(item.kind === 'node' ? 'data-issue-node' : 'data-issue-link', item.id);
      const circle = doc.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('class', 'pv-issue-badge-bg');
      circle.setAttribute('r', String(R));
      const glyph = doc.createElementNS(SVG_NS, 'path');
      glyph.setAttribute('class', 'pv-issue-badge-icon');
      const title = doc.createElementNS(SVG_NS, 'title');
      g.append(circle, glyph, title);
      this.layer.append(g);
      this.badges.set(k, g);
    }
    setAttr(g, 'data-issue-severity', severity);
    setAttr(g, 'transform', `translate(${round(at.x)},${round(at.y)})`);
    setAttr(g.children[1]!, 'd', GLYPHS[severity]);
    const title = g.children[2]!;
    if (title.textContent !== text) title.textContent = text;
  }

  /** Where the badge goes: a node's top-right corner, or the middle of a link's route. */
  private anchor(item: ItemRef): Point | undefined {
    if (item.kind === 'node') {
      const b = this.diagram.itemBounds(item);
      return b && { x: b.x + b.width, y: b.y };
    }
    const path = this.diagram.getLinkPath(item.id);
    return path && polylineMidpoint(path);
  }

  private elementOf(item: ItemRef): Element | null {
    const attr = item.kind === 'node' ? 'data-node-id' : 'data-link-id';
    const layer = item.kind === 'node' ? this.view.layers.nodes : this.view.layers.links;
    return layer.querySelector(`[${attr}="${item.id.replace(/["\\]/g, '\\$&')}"]`);
  }

  destroy(): void {
    this.frame.cancel();
    for (const c of this.cleanup) c();
    for (const el of this.marked.values()) clearAttrs(el);
    this.layer.remove();
  }
}

const key = (kind: string, id: string) => `${kind}\u0000${id}`;
const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const round = (n: number) => Math.round(n * 100) / 100;

function setAttr(el: Element, name: string, value: string): void {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

function clearAttrs(el: Element): void {
  el.removeAttribute('data-issue-severity');
  el.removeAttribute('aria-description');
}
