import type { Point, Rect } from '../model/types';
import type { PortDirection } from '../symbols/types';

export const EPS = 1e-6;

/** Direction index: 0 = right, 1 = down, 2 = left, 3 = up (y grows downward). */
export type Dir = 0 | 1 | 2 | 3;
export const DX = [1, 0, -1, 0] as const;
export const DY = [0, 1, 0, -1] as const;

export function dirIndex(d: PortDirection): Dir {
  switch (d) {
    case 'right':
      return 0;
    case 'bottom':
      return 1;
    case 'left':
      return 2;
    default:
      return 3;
  }
}

export const opposite = (d: Dir): Dir => ((d + 2) % 4) as Dir;
export const isHorizontal = (d: Dir): boolean => d === 0 || d === 2;

/** Edges of an axis-aligned box. */
export interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}

export function inflate(r: Rect, c: number): Box {
  return { l: r.x - c, t: r.y - c, r: r.x + r.width + c, b: r.y + r.height + c };
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.l <= b.r && b.l <= a.r && a.t <= b.b && b.t <= a.b;
}

/** True when the axis-aligned segment a-b enters the open interior of `box`. */
export function segmentHitsBox(a: Point, b: Point, box: Box, eps = EPS): boolean {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  return maxX > box.l + eps && minX < box.r - eps && maxY > box.t + eps && minY < box.b - eps;
}

export const samePoint = (a: Point, b: Point): boolean =>
  Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;

/** Removes duplicate points and collinear middle points that do not reverse direction. */
export function simplify(pts: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of pts) {
    const n = out.length;
    const last = out[n - 1];
    if (last && samePoint(last, p)) continue;
    if (n >= 2 && last) {
      const a = out[n - 2]!;
      const vertical = Math.abs(a.x - last.x) < EPS && Math.abs(last.x - p.x) < EPS;
      const horizontal = Math.abs(a.y - last.y) < EPS && Math.abs(last.y - p.y) < EPS;
      if (vertical && (last.y - a.y) * (p.y - last.y) > 0) {
        out[n - 1] = p;
        continue;
      }
      if (horizontal && (last.x - a.x) * (p.x - last.x) > 0) {
        out[n - 1] = p;
        continue;
      }
    }
    out.push(p);
  }
  return out;
}

/** Sorted, de-duplicated copy of `values` (values closer than EPS collapse into one). */
export function uniqueSorted(values: number[]): number[] {
  values.sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of values) {
    if (out.length === 0 || v - out[out.length - 1]! > EPS) out.push(v);
  }
  return out;
}

/** Index of `v` in sorted `arr` (within EPS), or -1. */
export function indexOf(arr: number[], v: number): number {
  let lo = 0;
  let hi = arr.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const m = arr[mid]!;
    if (Math.abs(m - v) <= EPS) return mid;
    if (m < v) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

/** First index whose value is > v + EPS (strictly greater). */
export function upperBound(arr: number[], v: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid]! > v + EPS) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** First index whose value is >= v - EPS. */
export function lowerBound(arr: number[], v: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid]! >= v - EPS) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}
