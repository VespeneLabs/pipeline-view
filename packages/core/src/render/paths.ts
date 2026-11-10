/** Pure SVG path builders for links: polylines with line jumps (FR-12) and flow-direction chevrons (FR-14). */
import type { Point, Rect } from '../model/types';

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

/**
 * Orthogonal leader from an annotation box to its anchor node box (FR-18):
 * a straight line when the boxes overlap on one axis, otherwise one elbow
 * (leave the card horizontally, enter the node vertically). Empty if the boxes intersect.
 */
export function leaderPoints(card: Rect, node: Rect): Point[] {
  const cx2 = card.x + card.width;
  const cy2 = card.y + card.height;
  const nx2 = node.x + node.width;
  const ny2 = node.y + node.height;
  const xOverlap = Math.min(cx2, nx2) - Math.max(card.x, node.x);
  const yOverlap = Math.min(cy2, ny2) - Math.max(card.y, node.y);
  if (xOverlap > 0 && yOverlap > 0) return [];
  if (xOverlap > 0) {
    const x = Math.max(card.x, node.x) + xOverlap / 2;
    return card.y > node.y
      ? [
          { x, y: card.y },
          { x, y: ny2 },
        ]
      : [
          { x, y: cy2 },
          { x, y: node.y },
        ];
  }
  if (yOverlap > 0) {
    const y = Math.max(card.y, node.y) + yOverlap / 2;
    return card.x > node.x
      ? [
          { x: card.x, y },
          { x: nx2, y },
        ]
      : [
          { x: cx2, y },
          { x: node.x, y },
        ];
  }
  const y = card.y + card.height / 2;
  const x = node.x + node.width / 2;
  const startX = card.x > node.x ? card.x : cx2;
  const endY = card.y > node.y ? ny2 : node.y;
  return [
    { x: startX, y },
    { x, y },
    { x, y: endY },
  ];
}
