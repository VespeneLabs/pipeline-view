/**
 * Geometry for link ends attached to another link (`LinkModel.fromAttach` / `toAttach`): where a
 * fraction of a route lies, and which fraction of a route is nearest to a point. Pure and DOM-free.
 */
import type { LinkModel, Point } from '../model/types';

export interface RoutePoint {
  point: Point;
  /** Index of the route segment the point lies on (the segment from `route[segment]` to the next point). */
  segment: number;
  /** Whether that segment is horizontal. */
  horizontal: boolean;
}

const dist = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const clamp01 = (v: number) => (v > 1 ? 1 : v > 0 ? v : 0);

/**
 * The point at fraction `at` (0 = start, 1 = end) of an orthogonal route's length. The coordinate along
 * the segment is rounded to a whole diagram unit, so the point lies exactly on the segment.
 * Returns undefined for a route with fewer than two points.
 */
export function pointAlong(route: readonly Point[], at: number): RoutePoint | undefined {
  if (route.length < 2) return undefined;
  let total = 0;
  for (let i = 1; i < route.length; i++) total += dist(route[i - 1]!, route[i]!);
  let left = clamp01(Number.isFinite(at) ? at : 0) * total;
  let last = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]!;
    const b = route[i]!;
    const len = dist(a, b);
    if (len === 0) continue;
    last = i - 1;
    if (left <= len) return onSegment(a, b, left, last);
    left -= len;
  }
  const a = route[last]!;
  const b = route[last + 1]!;
  return onSegment(a, b, dist(a, b), last);
}

function onSegment(a: Point, b: Point, along: number, segment: number): RoutePoint {
  const horizontal = a.y === b.y;
  const [lo, hi] = horizontal ? [a.x, b.x] : [a.y, b.y];
  const raw = lo + Math.sign(hi - lo) * along;
  const v = Math.min(Math.max(Math.round(raw), Math.min(lo, hi)), Math.max(lo, hi));
  return { point: horizontal ? { x: v, y: a.y } : { x: a.x, y: v }, segment, horizontal };
}

/** The fraction (0..1) of an orthogonal route's length that is nearest to `p`. */
export function fractionAlong(route: readonly Point[], p: Point): number {
  let total = 0;
  let best = Infinity;
  let bestAt = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]!;
    const b = route[i]!;
    const len = dist(a, b);
    const x = Math.min(Math.max(p.x, Math.min(a.x, b.x)), Math.max(a.x, b.x));
    const y = Math.min(Math.max(p.y, Math.min(a.y, b.y)), Math.max(a.y, b.y));
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < best) {
      best = d;
      bestAt = total + dist(a, { x, y });
    }
    total += len;
  }
  return total === 0 ? 0 : bestAt / total;
}

/** The ids of the links `l`'s ends are attached to (none, one or two). */
export function attachHosts(l: LinkModel): string[] {
  const out: string[] = [];
  if (l.fromAttach) out.push(l.fromAttach.link);
  if (l.toAttach && l.toAttach.link !== l.fromAttach?.link) out.push(l.toAttach.link);
  return out;
}

/**
 * Whether attaching an end of link `id` to `host` would close a loop of attachments (a link attached to
 * itself, directly or through other links). `links` is the current model.
 */
export function attachCycle(
  links: ReadonlyMap<string, LinkModel>,
  id: string,
  host: string,
): boolean {
  const seen = new Set<string>();
  const stack = [host];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === id) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const l = links.get(cur);
    if (l) stack.push(...attachHosts(l));
  }
  return false;
}
