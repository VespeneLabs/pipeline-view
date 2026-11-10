/**
 * Pure helpers for editing orthogonal link paths (FR-11). A "path" is the full polyline
 * [fromPort, ...waypoints, toPort]; the stored `waypoints` are its interior points.
 */
import type { Point } from '../model/types';

const EPS = 1e-6;
const isH = (a: Point, b: Point): boolean => Math.abs(a.y - b.y) < EPS;
const same = (a: Point, b: Point): boolean =>
  Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;

/** Drops duplicate points and straight-through middle points. Endpoints are kept. */
export function cleanPath(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && same(last, p)) continue;
    const prev = out[out.length - 2];
    if (prev && last) {
      const straightV =
        Math.abs(prev.x - last.x) < EPS &&
        Math.abs(last.x - p.x) < EPS &&
        (last.y - prev.y) * (p.y - last.y) > 0;
      const straightH =
        Math.abs(prev.y - last.y) < EPS &&
        Math.abs(last.y - p.y) < EPS &&
        (last.x - prev.x) * (p.x - last.x) > 0;
      if (straightV || straightH) {
        out[out.length - 1] = { x: p.x, y: p.y };
        continue;
      }
    }
    out.push({ x: p.x, y: p.y });
  }
  return out;
}

/** Interior points of a cleaned path, ready to store as `LinkModel.waypoints`. */
export function toWaypoints(path: Point[]): Point[] {
  return cleanPath(path).slice(1, -1);
}

/** Point on the segment from `a` towards `b`, at most `dist` away and never past the middle. */
function towards(a: Point, b: Point, dist: number): Point {
  const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
  const t = len === 0 ? 0 : Math.min(dist, len / 2) / len;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Drags segment `k` of `path` perpendicular to itself by `delta` (only the perpendicular component is used).
 * Segments attached to a port keep a short stub at the port, so the port end never moves and the
 * pipe still leaves the port in its direction. The result may contain duplicate points; run
 * `toWaypoints` when committing. Always call it with the path from the start of the gesture.
 */
export function moveSegment(path: Point[], k: number, delta: Point, stub = 12): Point[] {
  const pts = path.map((p) => ({ x: p.x, y: p.y }));
  if (k < 0 || k >= pts.length - 1) return pts;
  if (k === pts.length - 2) {
    const s = towards(pts[k + 1]!, pts[k]!, stub);
    pts.splice(k + 1, 0, { ...s }, { ...s });
  }
  if (k === 0) {
    const s = towards(pts[0]!, pts[1]!, stub);
    pts.splice(1, 0, { ...s }, { ...s });
    k = 2;
  }
  const a = pts[k]!;
  const b = pts[k + 1]!;
  if (isH(a, b)) {
    a.y += delta.y;
    b.y += delta.y;
  } else {
    a.x += delta.x;
    b.x += delta.x;
  }
  return pts;
}

/**
 * Removes bend `i` (an interior point index of `path`). When its neighbours aren't aligned, the corner flips to
 * the opposite side. Bends next to a port can only be removed when that keeps the port direction.
 */
export function removeBend(path: Point[], i: number): Point[] {
  const pts = cleanPath(path);
  if (i <= 0 || i >= pts.length - 1) return pts;
  const a = pts[i - 1]!;
  const b = pts[i + 1]!;
  const c = pts[i]!;
  if (Math.abs(a.x - b.x) < EPS || Math.abs(a.y - b.y) < EPS) {
    pts.splice(i, 1);
    return cleanPath(pts);
  }
  if (i === 1 || i === pts.length - 2) return pts;
  const c1 = { x: a.x, y: b.y };
  pts[i] = same(c1, c) ? { x: b.x, y: a.y } : c1;
  return cleanPath(pts);
}

/**
 * Splits segment `k` at the projection of `at`, inserting a zero-length jog that a following
 * `moveSegment` on either half turns into two new bends. Returns the new path and the index of the
 * second half.
 */
export function splitSegment(
  path: Point[],
  k: number,
  at: Point,
): { path: Point[]; second: number } {
  const pts = path.map((p) => ({ x: p.x, y: p.y }));
  const a = pts[k]!;
  const b = pts[k + 1]!;
  const p = isH(a, b)
    ? { x: Math.min(Math.max(at.x, Math.min(a.x, b.x)), Math.max(a.x, b.x)), y: a.y }
    : { x: a.x, y: Math.min(Math.max(at.y, Math.min(a.y, b.y)), Math.max(a.y, b.y)) };
  pts.splice(k + 1, 0, { ...p }, { ...p });
  return { path: pts, second: k + 2 };
}

/**
 * Keeps a manual link orthogonal after its end ports moved: the first and last waypoints slide along
 * the axis that joins them to their port. Interior waypoints never move.
 */
export function adjustWaypoints(
  waypoints: Point[],
  oldFrom: Point,
  newFrom: Point,
  oldTo: Point,
  newTo: Point,
): Point[] {
  if (waypoints.length === 0) return [];
  const out = waypoints.map((p) => ({ x: p.x, y: p.y }));
  const first = waypoints[0]!;
  const last = waypoints[waypoints.length - 1]!;
  if (Math.abs(first.y - oldFrom.y) < EPS) out[0]!.y = newFrom.y;
  else if (Math.abs(first.x - oldFrom.x) < EPS) out[0]!.x = newFrom.x;
  const n = out.length - 1;
  if (Math.abs(last.y - oldTo.y) < EPS) out[n]!.y = newTo.y;
  else if (Math.abs(last.x - oldTo.x) < EPS) out[n]!.x = newTo.x;
  return out;
}
