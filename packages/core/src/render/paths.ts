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

/**
 * Paired "//" tick marks for pneumatic signal lines (Figma reference #50): every `period` units along
 * each segment long enough to hold a pair, slanted like the reference (lower-left to upper-right going +x).
 */
export function ticksPath(points: readonly Point[], period = 40): string {
  const along = 4;
  const across = 8;
  const gap = 3.5;
  let d = '';
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < period) continue;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    // Perpendicular, pointing to screen-down for +x travel.
    const nx = -uy;
    const ny = ux;
    const count = Math.floor(len / period);
    const start = (len - (count - 1) * period) / 2;
    for (let k = 0; k < count; k++) {
      const t = start + k * period;
      for (const o of [-gap, gap]) {
        const cx = a.x + ux * (t + o);
        const cy = a.y + uy * (t + o);
        d += `M${pt({ x: cx - ux * along + nx * across, y: cy - uy * along + ny * across })}`;
        d += `L${pt({ x: cx + ux * along - nx * across, y: cy + uy * along - ny * across })}`;
      }
    }
  }
  return d;
}

/**
 * Where a link label goes. With `position` (0..1), at that fraction of the path length. Otherwise at
 * the middle of the longest segment whose label box (`size`, centred) stays clear of every rect in
 * `avoid`; failing that, beside a segment (left/right of vertical runs, above/below horizontal ones);
 * and finally the middle of the longest segment.
 */
export function linkLabelPoint(
  points: readonly Point[],
  size: { width: number; height: number },
  avoid: readonly Rect[] = [],
  position?: number,
): Point | null {
  if (points.length < 2) return null;
  const segs: { a: Point; b: Point; len: number }[] = [];
  let total = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    segs.push({ a, b, len });
    total += len;
  }
  const along = (s: { a: Point; b: Point; len: number }, t: number): Point => ({
    x: s.a.x + (s.b.x - s.a.x) * t,
    y: s.a.y + (s.b.y - s.a.y) * t,
  });
  if (position !== undefined && Number.isFinite(position)) {
    let rest = Math.min(Math.max(position, 0), 1) * total;
    for (const s of segs) {
      if (rest <= s.len || s === segs[segs.length - 1])
        return along(s, s.len ? Math.min(rest / s.len, 1) : 0);
      rest -= s.len;
    }
  }
  const clear = (p: Point) =>
    avoid.every(
      (r) =>
        p.x + size.width / 2 <= r.x ||
        p.x - size.width / 2 >= r.x + r.width ||
        p.y + size.height / 2 <= r.y ||
        p.y - size.height / 2 >= r.y + r.height,
    );
  const byLength = [...segs].sort((s, t) => t.len - s.len);
  for (const s of byLength) {
    const p = along(s, 0.5);
    if (clear(p)) return p;
  }
  // Nothing centred on the line is clear (a route hugging nodes): try beside the line instead.
  for (const s of byLength) {
    const p = along(s, 0.5);
    const vertical = s.a.x === s.b.x;
    const off = (vertical ? size.width : size.height) / 2 + 4;
    for (const sign of [-1, 1]) {
      const q = vertical ? { x: p.x + sign * off, y: p.y } : { x: p.x, y: p.y + sign * off };
      if (clear(q)) return q;
    }
  }
  return along(byLength[0]!, 0.5);
}
