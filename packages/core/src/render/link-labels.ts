/**
 * Link-label layout: labels avoid nodes and each other. DOM-free; boxes are estimates, so there is no
 * layout read.
 *
 * Labels are placed in link-id order and each one treats the boxes of the labels before it as
 * obstacles, so the result depends only on the model, never on the order links were added or redrawn.
 * `update()` is incremental: it re-places the labels that changed and the ones whose surroundings
 * changed (a node or another label moved into or out of the area their route covers), and ends up with
 * the same layout as placing everything from scratch.
 */
import type { Point, Rect } from '../model/types';
import { linkLabelPoint } from './paths';

export interface LinkLabelSpec {
  /** The link's route. */
  route: readonly Point[];
  /** Estimated label box. */
  size: { width: number; height: number };
  /** Preferred position as a fraction of the path length (LinkModel.labelPosition). */
  position?: number;
}

interface Entry extends LinkLabelSpec {
  /** Every box this label could take lies inside this rect. */
  region: Rect;
  box: Rect | null;
}

/** How far a label's box can reach from its route: beside a segment, plus half the box again. */
const REACH = 4;

const intersects = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const sameSpec = (a: LinkLabelSpec, b: LinkLabelSpec): boolean =>
  a.position === b.position &&
  a.size.width === b.size.width &&
  a.size.height === b.size.height &&
  a.route.length === b.route.length &&
  a.route.every((p, i) => p.x === b.route[i]!.x && p.y === b.route[i]!.y);

function regionOf(spec: LinkLabelSpec): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of spec.route) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  }
  const dx = spec.size.width + REACH;
  const dy = spec.size.height + REACH;
  return { x: x0 - dx, y: y0 - dy, width: x1 - x0 + 2 * dx, height: y1 - y0 + 2 * dy };
}

export class LinkLabelLayout {
  private readonly entries = new Map<string, Entry>();
  /** Link ids in placement order; rebuilt when a label is added or removed. */
  private order: string[] | null = null;
  private readonly dirty = new Set<string>();
  /** Areas where an obstacle appeared, disappeared or moved since the last update. */
  private touched: Rect[] = [];

  /** Sets, replaces or (with null) removes a link's label. */
  set(id: string, spec: LinkLabelSpec | null): void {
    const prev = this.entries.get(id);
    if (!spec) {
      if (!prev) return;
      if (prev.box) this.touched.push(prev.box);
      this.entries.delete(id);
      this.dirty.delete(id);
      this.order = null;
      return;
    }
    if (prev && sameSpec(prev, spec)) return;
    this.entries.set(id, {
      route: spec.route,
      size: spec.size,
      position: spec.position,
      region: regionOf(spec),
      box: prev?.box ?? null,
    });
    this.dirty.add(id);
    if (!prev) this.order = null;
  }

  /** Reports that an obstacle (a node) was added, removed or changed within `rect`. */
  touch(rect: Rect): void {
    this.touched.push(rect);
  }

  /** The label's centre, or null when it has no place (no route). */
  point(id: string): Point | null {
    const b = this.entries.get(id)?.box;
    return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null;
  }

  /** The label's estimated box, or null. */
  box(id: string): Rect | null {
    return this.entries.get(id)?.box ?? null;
  }

  /**
   * Places what needs placing and returns the ids of the labels that moved. `obstaclesIn` returns the
   * node rects that intersect a region.
   */
  update(obstaclesIn: (region: Rect) => Rect[]): string[] {
    if (!this.dirty.size && !this.touched.length) return [];
    this.order ??= [...this.entries.keys()].sort();
    const order = this.order;
    const touched = this.touched;
    const moved: string[] = [];
    for (let i = 0; i < order.length; i++) {
      const id = order[i]!;
      const e = this.entries.get(id)!;
      if (!this.dirty.has(id) && !touched.some((r) => intersects(r, e.region))) continue;
      const avoid = obstaclesIn(e.region);
      for (let j = 0; j < i; j++) {
        const b = this.entries.get(order[j]!)!.box;
        if (b && intersects(b, e.region)) avoid.push(b);
      }
      const at = linkLabelPoint(e.route, e.size, avoid, e.position);
      const box = at && {
        x: at.x - e.size.width / 2,
        y: at.y - e.size.height / 2,
        width: e.size.width,
        height: e.size.height,
      };
      const prev = e.box;
      if (
        prev?.x === box?.x &&
        prev?.y === box?.y &&
        prev?.width === box?.width &&
        prev?.height === box?.height
      ) {
        continue;
      }
      // Labels placed after this one may have been pushed away by the old box, or now be under the new.
      if (prev) touched.push(prev);
      if (box) touched.push(box);
      e.box = box;
      moved.push(id);
    }
    this.dirty.clear();
    this.touched = [];
    return moved;
  }
}
