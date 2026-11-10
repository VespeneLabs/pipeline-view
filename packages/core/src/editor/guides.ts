/** Snap-to-grid and alignment guides for moving nodes (FR-25). Pure. */
import type { Point, Rect } from '../model/types';

export interface Guide {
  /** A vertical guide is the line x = pos; a horizontal guide is y = pos. */
  orientation: 'vertical' | 'horizontal';
  pos: number;
  /** Extent of the line along its own axis. */
  from: number;
  to: number;
}

export const snapValue = (v: number, size: number): number => Math.round(v / size) * size;

export const snapPoint = (p: Point, size: number): Point => ({
  x: snapValue(p.x, size),
  y: snapValue(p.y, size),
});

const xs = (r: Rect): number[] => [r.x, r.x + r.width / 2, r.x + r.width];
const ys = (r: Rect): number[] => [r.y, r.y + r.height / 2, r.y + r.height];

/**
 * Finds the smallest shift (within `threshold` on each axis) that aligns an edge or the center of `moving`
 * with an edge or center of one of `others`. Returns the shift and the guide lines to draw.
 */
export function alignmentSnap(
  moving: Rect,
  others: Iterable<Rect>,
  threshold: number,
): { dx: number; dy: number; guides: Guide[] } {
  const list = [...others];
  let dx = 0;
  let dy = 0;
  let bestX = threshold + 1;
  let bestY = threshold + 1;
  for (const o of list) {
    for (const a of xs(moving)) {
      for (const b of xs(o)) {
        const d = b - a;
        if (Math.abs(d) < Math.abs(bestX)) bestX = Math.abs(d) <= threshold ? d : bestX;
      }
    }
    for (const a of ys(moving)) {
      for (const b of ys(o)) {
        const d = b - a;
        if (Math.abs(d) < Math.abs(bestY)) bestY = Math.abs(d) <= threshold ? d : bestY;
      }
    }
  }
  if (Math.abs(bestX) <= threshold) dx = bestX;
  if (Math.abs(bestY) <= threshold) dy = bestY;

  const moved = { ...moving, x: moving.x + dx, y: moving.y + dy };
  const guides: Guide[] = [];
  const eq = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  if (Math.abs(bestX) <= threshold) {
    for (const pos of new Set(xs(moved))) {
      const hits = list.filter((o) => xs(o).some((v) => eq(v, pos)));
      if (!hits.length) continue;
      const all = [moved, ...hits];
      guides.push({
        orientation: 'vertical',
        pos,
        from: Math.min(...all.map((r) => r.y)),
        to: Math.max(...all.map((r) => r.y + r.height)),
      });
    }
  }
  if (Math.abs(bestY) <= threshold) {
    for (const pos of new Set(ys(moved))) {
      const hits = list.filter((o) => ys(o).some((v) => eq(v, pos)));
      if (!hits.length) continue;
      const all = [moved, ...hits];
      guides.push({
        orientation: 'horizontal',
        pos,
        from: Math.min(...all.map((r) => r.x)),
        to: Math.max(...all.map((r) => r.x + r.width)),
      });
    }
  }
  return { dx, dy, guides };
}
