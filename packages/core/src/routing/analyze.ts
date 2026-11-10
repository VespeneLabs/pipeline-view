import type { Point } from '../model/types';
import { EPS } from './geometry';
import type { Crossing, Junction, RouteResult } from './types';

interface Seg {
  link: string;
  horizontal: boolean;
  /** Fixed coordinate (y for horizontal, x for vertical). */
  c: number;
  lo: number;
  hi: number;
}

interface StoredCrossing {
  crossing: Crossing;
  links: [string, string];
}

const BUCKET = 64;
const pkey = (p: Point): string => `${Math.round(p.x * 64)},${Math.round(p.y * 64)}`;
const cell = (x: number, y: number): number =>
  (Math.floor(x / BUCKET) + 32768) * 65536 + (Math.floor(y / BUCKET) + 32768);

/**
 * Incremental line-jump and junction analysis (FR-12).
 * - A crossing is where a horizontal and a vertical segment of two different links meet in both interiors.
 *   The hop goes on the horizontal link only.
 * - A junction is a path vertex where links touching it occupy three or more distinct directions (a branch off a
 *   shared trunk, or a link ending on another link). Crossings at junction points are dropped.
 *
 * `update()` takes only the links that changed, so a drag that re-routes a few links costs time proportional
 * to those links, not to the whole diagram.
 */
export class RouteAnalyzer {
  private readonly routes = new Map<string, Point[]>();
  private readonly segs = new Map<string, Seg[]>();
  private readonly buckets = new Map<number, Set<Seg>>();
  private readonly crossings = new Map<string, StoredCrossing>();
  private readonly crossingsByLink = new Map<string, Set<string>>();
  private readonly junctions = new Map<string, Junction>();

  /** Applies changed routes. `null` removes a link. */
  update(changes: Iterable<readonly [string, Point[] | null]>): this {
    const list = [...changes];
    const dirty = new Map<string, Point>();
    const mark = (p: Point) => dirty.set(pkey(p), p);

    for (const [id] of list) {
      this.routes.get(id)?.forEach(mark);
      for (const s of this.segs.get(id) ?? []) {
        this.verticesOn(s, mark);
        this.forCells(s, (k) => this.buckets.get(k)?.delete(s));
      }
      this.removeCrossings(id);
      this.routes.delete(id);
      this.segs.delete(id);
    }

    const added: Seg[] = [];
    for (const [id, pts] of list) {
      if (!pts) continue;
      this.routes.set(id, pts);
      const segs = toSegs(id, pts);
      this.segs.set(id, segs);
      for (const s of segs) {
        this.forCells(s, (k) => {
          let set = this.buckets.get(k);
          if (!set) this.buckets.set(k, (set = new Set()));
          set.add(s);
        });
        added.push(s);
      }
      pts.forEach(mark);
    }

    for (const s of added) {
      this.verticesOn(s, mark);
      this.addCrossings(s);
    }
    for (const [k, p] of dirty) this.recomputeJunction(k, p);
    return this;
  }

  /** Current result. Crossings at junction points are left out. */
  result(): { crossings: Crossing[]; junctions: Junction[] } {
    const crossings: Crossing[] = [];
    for (const { crossing } of this.crossings.values()) {
      if (!this.junctions.has(pkey(crossing.point))) crossings.push(crossing);
    }
    return { crossings, junctions: [...this.junctions.values()] };
  }

  // ---------------------------------------------------------------- internals

  private forCells(s: Seg, fn: (key: number) => void): void {
    const b0 = Math.floor((s.lo - EPS) / BUCKET);
    const b1 = Math.floor((s.hi + EPS) / BUCKET);
    const c0 = Math.floor((s.c - EPS) / BUCKET);
    const c1 = Math.floor((s.c + EPS) / BUCKET);
    for (let b = b0; b <= b1; b++) {
      for (let c = c0; c <= c1; c++) {
        fn(s.horizontal ? (b + 32768) * 65536 + (c + 32768) : (c + 32768) * 65536 + (b + 32768));
      }
    }
  }

  /** Visits every segment sharing a bucket with `s`, once each. */
  private neighbours(s: Seg, fn: (o: Seg) => void): void {
    const seen = new Set<Seg>();
    this.forCells(s, (k) => {
      for (const o of this.buckets.get(k) ?? []) {
        if (o === s || seen.has(o)) continue;
        seen.add(o);
        fn(o);
      }
    });
  }

  /** Marks vertices of other links that lie on `s`: a junction there may appear or disappear. */
  private verticesOn(s: Seg, mark: (p: Point) => void): void {
    this.neighbours(s, (o) => {
      if (o.link === s.link) return;
      const ends = o.horizontal
        ? [
            { x: o.lo, y: o.c },
            { x: o.hi, y: o.c },
          ]
        : [
            { x: o.c, y: o.lo },
            { x: o.c, y: o.hi },
          ];
      for (const p of ends) if (onSeg(s, p)) mark(p);
    });
  }

  private addCrossings(s: Seg): void {
    this.neighbours(s, (o) => {
      if (o.link === s.link || o.horizontal === s.horizontal) return;
      const h = s.horizontal ? s : o;
      const v = s.horizontal ? o : s;
      if (v.c <= h.lo + EPS || v.c >= h.hi - EPS || h.c <= v.lo + EPS || h.c >= v.hi - EPS) return;
      const point = { x: v.c, y: h.c };
      const k = `${h.link}\u0000${v.link}\u0000${pkey(point)}`;
      if (this.crossings.has(k)) return;
      this.crossings.set(k, {
        crossing: { linkId: h.link, point, orientation: 'horizontal' },
        links: [h.link, v.link],
      });
      for (const l of [h.link, v.link]) {
        let set = this.crossingsByLink.get(l);
        if (!set) this.crossingsByLink.set(l, (set = new Set()));
        set.add(k);
      }
    });
  }

  private removeCrossings(link: string): void {
    for (const k of this.crossingsByLink.get(link) ?? []) {
      const c = this.crossings.get(k);
      this.crossings.delete(k);
      if (c) for (const l of c.links) if (l !== link) this.crossingsByLink.get(l)?.delete(k);
    }
    this.crossingsByLink.delete(link);
  }

  private recomputeJunction(k: string, p: Point): void {
    const dirs = new Map<string, number>();
    // Only path vertices can be junctions; a point where links merely pass straight through is a crossing.
    let vertex = false;
    for (const s of this.buckets.get(cell(p.x, p.y)) ?? []) {
      if (!onSeg(s, p)) continue;
      const along = s.horizontal ? p.x : p.y;
      if (Math.abs(along - s.lo) < EPS || Math.abs(along - s.hi) < EPS) vertex = true;
      let m = 0;
      // Bits: 1 right, 2 down, 4 left, 8 up.
      if (along > s.lo + EPS) m |= s.horizontal ? 4 : 8;
      if (along < s.hi - EPS) m |= s.horizontal ? 1 : 2;
      dirs.set(s.link, (dirs.get(s.link) ?? 0) | m);
    }
    let union = 0;
    for (const m of dirs.values()) union |= m;
    if (vertex && dirs.size >= 2 && popcount(union) >= 3) {
      this.junctions.set(k, { point: { x: p.x, y: p.y }, linkIds: [...dirs.keys()].sort() });
    } else this.junctions.delete(k);
  }
}

/** Stateless analysis of a full set of routes. */
export function analyzeRoutes(routes: RouteResult[]): {
  crossings: Crossing[];
  junctions: Junction[];
} {
  return new RouteAnalyzer().update(routes.map((r) => [r.linkId, r.points] as const)).result();
}

function toSegs(link: string, pts: Point[]): Seg[] {
  const out: Seg[] = [];
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k]!;
    const b = pts[k + 1]!;
    if (Math.abs(a.y - b.y) < EPS && Math.abs(a.x - b.x) >= EPS) {
      out.push({ link, horizontal: true, c: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) });
    } else if (Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) >= EPS) {
      out.push({ link, horizontal: false, c: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y) });
    }
  }
  return out;
}

function onSeg(s: Seg, p: Point): boolean {
  const c = s.horizontal ? p.y : p.x;
  const along = s.horizontal ? p.x : p.y;
  return Math.abs(c - s.c) < EPS && along >= s.lo - EPS && along <= s.hi + EPS;
}

function popcount(m: number): number {
  let n = 0;
  for (; m; m &= m - 1) n++;
  return n;
}
