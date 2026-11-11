/**
 * Geometry for host-given branch points (`NodeModel.branchPoints`): the trunk from a port to the point
 * where its links part, and the way each link leaves that point. Pure and DOM-free.
 */
import type { Point, Rect } from '../model/types';
import type { PortDirection } from '../symbols/types';

const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

/** Drops repeated points. */
function compact(pts: Point[]): Point[] {
  return pts.filter((p, i) => i === 0 || !same(p, pts[i - 1]!));
}

/**
 * The shared run from a port to its branch point: straight out of the port, then one turn to the
 * point. A point beside or behind the port is reached around a stub of `clearance` length.
 */
export function trunkPath(
  port: Point,
  direction: PortDirection,
  to: Point,
  clearance: number,
): Point[] {
  const horizontal = direction === 'left' || direction === 'right';
  const s = direction === 'right' || direction === 'bottom' ? 1 : -1;
  if (horizontal) {
    const ahead = (to.x - port.x) * s;
    if (ahead >= clearance || (ahead > 0 && to.y === port.y))
      return compact([port, { x: to.x, y: port.y }, to]);
    const stub = port.x + s * clearance;
    return compact([port, { x: stub, y: port.y }, { x: stub, y: to.y }, to]);
  }
  const ahead = (to.y - port.y) * s;
  if (ahead >= clearance || (ahead > 0 && to.x === port.x))
    return compact([port, { x: port.x, y: to.y }, to]);
  const stub = port.y + s * clearance;
  return compact([port, { x: port.x, y: stub }, { x: to.x, y: stub }, to]);
}

/** Whether the open segment a-b passes through the inside of `r` (touching its edge doesn't count). */
function crossesInside(a: Point, b: Point, r: Rect): boolean {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  return x1 > r.x && x0 < r.x + r.width && y1 > r.y && y0 < r.y + r.height;
}

/** Whether a path runs through the inside of any of the rects. */
export function pathCrosses(path: readonly Point[], rects: Iterable<Rect>): boolean {
  for (const r of rects) {
    for (let i = 1; i < path.length; i++) if (crossesInside(path[i - 1]!, path[i]!, r)) return true;
  }
  return false;
}

/** The direction of travel along the last segment of a path. */
export function arrival(path: readonly Point[]): PortDirection {
  const a = path[path.length - 2]!;
  const b = path[path.length - 1]!;
  if (a.y === b.y) return b.x >= a.x ? 'right' : 'left';
  return b.y >= a.y ? 'bottom' : 'top';
}

const OPPOSITE: Record<PortDirection, PortDirection> = {
  left: 'right',
  right: 'left',
  top: 'bottom',
  bottom: 'top',
};

/**
 * How each link leaves a branch point, so that they part there: every link heads for its other end,
 * never back along the trunk, and takes a direction no earlier link took while one is free.
 * `targets` maps link ids to the point each link runs to; the order of the map decides who chooses first.
 */
export function branchDirections(
  at: Point,
  trunkArrival: PortDirection,
  targets: ReadonlyMap<string, Point>,
): Map<string, PortDirection> {
  const back = OPPOSITE[trunkArrival];
  const used = new Set<PortDirection>();
  const out = new Map<string, PortDirection>();
  for (const [id, t] of targets) {
    const dx = t.x - at.x;
    const dy = t.y - at.y;
    const h: PortDirection = dx >= 0 ? 'right' : 'left';
    const v: PortDirection = dy >= 0 ? 'bottom' : 'top';
    const wish = Math.abs(dx) >= Math.abs(dy) ? [h, v] : [v, h];
    const order = [...wish, OPPOSITE[wish[1]!], OPPOSITE[wish[0]!]].filter((d) => d !== back);
    const dir = order.find((d) => !used.has(d)) ?? order[0]!;
    used.add(dir);
    out.set(id, dir);
  }
  return out;
}

/**
 * The last point that paths starting at the same point have in common: where links that leave one
 * port part when the router decides. Undefined for fewer than two paths.
 */
export function partingPoint(paths: readonly (readonly Point[])[]): Point | undefined {
  if (paths.length < 2 || paths.some((p) => !p.length)) return undefined;
  let at = paths[0]![0]!;
  if (paths.some((p) => !same(p[0]!, at))) return undefined;
  const index = paths.map(() => 1);
  for (;;) {
    // The next vertex of every path must lie in one direction from `at`; they share up to the nearest.
    let dir: string | null = null;
    let reach = Infinity;
    for (let k = 0; k < paths.length; k++) {
      const next = paths[k]![index[k]!];
      if (!next) return at;
      const dx = next.x - at.x;
      const dy = next.y - at.y;
      if ((dx !== 0 && dy !== 0) || (dx === 0 && dy === 0)) return at;
      const d = dx !== 0 ? (dx > 0 ? 'r' : 'l') : dy > 0 ? 'd' : 'u';
      if (dir !== null && dir !== d) return at;
      dir = d;
      reach = Math.min(reach, Math.abs(dx) + Math.abs(dy));
    }
    const step = { r: [1, 0], l: [-1, 0], d: [0, 1], u: [0, -1] }[dir!]!;
    at = { x: at.x + step[0]! * reach, y: at.y + step[1]! * reach };
    for (let k = 0; k < paths.length; k++) if (same(paths[k]![index[k]!]!, at)) index[k]!++;
  }
}
