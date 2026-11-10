/** Pure SVG path builders for links: polylines with line jumps (FR-12) and flow-direction chevrons (FR-14). */
import type { Point } from '../model/types';

const r2 = (n: number) => Math.round(n * 100) / 100;
const pt = (p: Point) => `${r2(p.x)} ${r2(p.y)}`;

/**
 * Polyline through `points`, with a semicircular hop of radius `r` at each crossing point that lies
 * on one of its segments. Horizontal hops bulge up and vertical hops bulge left, whatever the travel direction.
 */
export function linkPath(
  points: readonly Point[],
  crossings: readonly Point[] = [],
  r = 8,
): string {
  if (points.length === 0) return '';
  let d = `M${pt(points[0]!)}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const horizontal = Math.abs(uy) < 1e-9;
    const vertical = Math.abs(ux) < 1e-9;
    if (crossings.length && (horizontal || vertical)) {
      const hops = crossings
        .map((c) => ({ c, t: (c.x - a.x) * ux + (c.y - a.y) * uy }))
        .filter(
          ({ c, t }) =>
            t >= r && t <= len - r && Math.abs(horizontal ? c.y - a.y : c.x - a.x) < 0.5,
        )
        .sort((p, q) => p.t - q.t);
      let lastT = -Infinity;
      for (const { c, t } of hops) {
        if (t - lastT < 2 * r) continue; // Overlapping hops collapse into one.
        lastT = t;
        const s = { x: c.x - ux * r, y: c.y - uy * r };
        const e = { x: c.x + ux * r, y: c.y + uy * r };
        // Sweep 1 is visually clockwise in y-down SVG: moving +x it bulges up, moving +y it bulges right.
        const sweep = horizontal ? (ux > 0 ? 1 : 0) : uy > 0 ? 0 : 1;
        d += `L${pt(s)}A${r2(r)} ${r2(r)} 0 0 ${sweep} ${pt(e)}`;
      }
    }
    d += `L${pt(b)}`;
  }
  return d;
}

/**
 * Open chevrons (size = length along the flow, width = 0.6 * size) at the middle of every
 * segment long enough to carry one comfortably.
 */
export function arrowsPath(points: readonly Point[], size = 10, minSegment = size * 4): string {
  let d = '';
  const half = (size * 0.6) / 2;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < minSegment) continue;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const tip = { x: (a.x + b.x) / 2 + (ux * size) / 2, y: (a.y + b.y) / 2 + (uy * size) / 2 };
    const back = { x: tip.x - ux * size, y: tip.y - uy * size };
    const l = { x: back.x - uy * half, y: back.y + ux * half };
    const rt = { x: back.x + uy * half, y: back.y - ux * half };
    d += `M${pt(l)}L${pt(tip)}L${pt(rt)}`;
  }
  return d;
}
