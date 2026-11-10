import type { Point } from '../model/types';
import { EPS } from './geometry';
import type { Crossing, Junction, RouteResult } from './types';

interface Seg {
  link: string;
  /** Fixed coordinate (y for horizontal, x for vertical). */
  c: number;
  lo: number;
  hi: number;
}

const BUCKET = 64;
const key = (p: Point): string => `${Math.round(p.x * 64)},${Math.round(p.y * 64)}`;

/**
 * Finds crossings (two links pass straight through the same point; the hop goes on the horizontal one)
 * and junctions (three or more distinct directions meet at a point where at least one link bends, ends
 * or branches off another).
 */
export function analyzeRoutes(routes: RouteResult[]): {
  crossings: Crossing[];
  junctions: Junction[];
} {
  const hs: Seg[] = [];
  const vs: Seg[] = [];
  for (const r of routes) {
    const pts = r.points;
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k]!;
      const b = pts[k + 1]!;
      if (Math.abs(a.y - b.y) < EPS && Math.abs(a.x - b.x) >= EPS) {
        hs.push({ link: r.linkId, c: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) });
      } else if (Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) >= EPS) {
        vs.push({ link: r.linkId, c: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y) });
      }
    }
  }

  // Junctions: for every path vertex, union the directions of all links touching it.
  const hBuckets = bucketize(hs, true);
  const vBuckets = bucketize(vs, false);
  const junctions: Junction[] = [];
  const junctionKeys = new Set<string>();
  const seen = new Set<string>();
  for (const r of routes) {
    for (const p of r.points) {
      const k = key(p);
      if (seen.has(k)) continue;
      seen.add(k);
      const dirs = new Map<string, number>();
      const add = (link: string, mask: number): void => {
        dirs.set(link, (dirs.get(link) ?? 0) | mask);
      };
      for (const s of hBuckets.get(bucketKey(p.x, p.y)) ?? []) {
        if (Math.abs(s.c - p.y) >= EPS || p.x < s.lo - EPS || p.x > s.hi + EPS) continue;
        if (p.x > s.lo + EPS) add(s.link, 4); // left
        if (p.x < s.hi - EPS) add(s.link, 1); // right
      }
      for (const s of vBuckets.get(bucketKey(p.x, p.y)) ?? []) {
        if (Math.abs(s.c - p.x) >= EPS || p.y < s.lo - EPS || p.y > s.hi + EPS) continue;
        if (p.y > s.lo + EPS) add(s.link, 8); // up
        if (p.y < s.hi - EPS) add(s.link, 2); // down
      }
      if (dirs.size < 2) continue;
      let union = 0;
      for (const m of dirs.values()) union |= m;
      if (popcount(union) >= 3) {
        junctions.push({ point: { x: p.x, y: p.y }, linkIds: [...dirs.keys()].sort() });
        junctionKeys.add(k);
      }
    }
  }

  // Crossings: horizontal and vertical segments of different links whose interiors intersect.
  vs.sort((a, b) => a.c - b.c);
  const crossings: Crossing[] = [];
  for (const h of hs) {
    let lo = 0;
    let hi = vs.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (vs[mid]!.c > h.lo + EPS) hi = mid;
      else lo = mid + 1;
    }
    for (let i = lo; i < vs.length; i++) {
      const v = vs[i]!;
      if (v.c >= h.hi - EPS) break;
      if (v.link === h.link) continue;
      if (h.c <= v.lo + EPS || h.c >= v.hi - EPS) continue;
      const point = { x: v.c, y: h.c };
      if (junctionKeys.has(key(point))) continue;
      crossings.push({ linkId: h.link, point, orientation: 'horizontal' });
    }
  }
  return { crossings, junctions };
}

function bucketKey(x: number, y: number): number {
  return (Math.floor(x / BUCKET) + 32768) * 65536 + (Math.floor(y / BUCKET) + 32768);
}

function bucketize(segs: Seg[], horizontal: boolean): Map<number, Seg[]> {
  const map = new Map<number, Seg[]>();
  for (const s of segs) {
    const b0 = Math.floor((s.lo - EPS) / BUCKET);
    const b1 = Math.floor((s.hi + EPS) / BUCKET);
    const c0 = Math.floor((s.c - EPS) / BUCKET);
    const c1 = Math.floor((s.c + EPS) / BUCKET);
    for (let b = b0; b <= b1; b++) {
      for (let c = c0; c <= c1; c++) {
        const k = horizontal
          ? (b + 32768) * 65536 + (c + 32768)
          : (c + 32768) * 65536 + (b + 32768);
        let list = map.get(k);
        if (!list) map.set(k, (list = []));
        if (list[list.length - 1] !== s) list.push(s);
      }
    }
  }
  return map;
}

function popcount(m: number): number {
  let n = 0;
  for (; m; m &= m - 1) n++;
  return n;
}
