import type { Point } from '../model/types';
import {
  type Box,
  type Dir,
  DX,
  DY,
  indexOf,
  lowerBound,
  opposite,
  simplify,
  uniqueSorted,
  upperBound,
} from './geometry';

export interface SearchParams {
  start: Point;
  /** Direction the path must leave `start` in, or -1 for any. */
  startDir: Dir | -1;
  goal: Point;
  /** Preferred direction of motion when arriving at `goal`, or -1 for any. */
  goalDir: Dir | -1;
  /** Inflated obstacles. The path never enters their open interior. */
  boxes: Box[];
  /** The search never leaves this box. */
  region: Box;
  bendPenalty: number;
  /** Give up (return null) when the grid would exceed this many points. Default: unlimited. */
  maxCells?: number;
}

/** Minimal binary min-heap of (priority, value) pairs. */
class Heap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size(): number {
    return this.keys.length;
  }
  push(key: number, val: number): void {
    const keys = this.keys;
    const vals = this.vals;
    let i = keys.length;
    keys.push(key);
    vals.push(val);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (keys[parent]! <= key) break;
      keys[i] = keys[parent]!;
      vals[i] = vals[parent]!;
      i = parent;
    }
    keys[i] = key;
    vals[i] = val;
  }
  pop(): number {
    const keys = this.keys;
    const vals = this.vals;
    const top = vals[0]!;
    const lastKey = keys.pop()!;
    const lastVal = vals.pop()!;
    const n = keys.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && keys[r]! < keys[l]! ? r : l;
        if (keys[c]! >= lastKey) break;
        keys[i] = keys[c]!;
        vals[i] = vals[c]!;
        i = c;
      }
      keys[i] = lastKey;
      vals[i] = lastVal;
    }
    return top;
  }
}

/**
 * Lower bound on the number of turns needed to reach the goal from a point while moving in `d`.
 * Used in the A* heuristic (keeps it admissible and consistent).
 */
function minTurns(dx: number, dy: number, d: Dir): number {
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const mx = DX[d];
  const my = DY[d];
  if (sx === 0 && sy === 0) return 0;
  if (sx === 0 || sy === 0) {
    // Aligned: straight ahead 0, perpendicular 1, behind 2.
    const dot = sx * mx + sy * my;
    return dot > 0 ? 0 : dot === 0 ? 1 : 2;
  }
  return (mx !== 0 && mx === sx) || (my !== 0 && my === sy) ? 1 : 2;
}

/**
 * Orthogonal A* over a sparse grid made of obstacle edges and endpoint coordinates.
 * The cost is path length plus `bendPenalty` per turn. Returns null when there is no path inside `region`.
 */
export function searchGrid(p: SearchParams): Point[] | null {
  const { start, goal, region, boxes, bendPenalty } = p;

  const rawX = [region.l, region.r, start.x, goal.x, (start.x + goal.x) / 2];
  const rawY = [region.t, region.b, start.y, goal.y, (start.y + goal.y) / 2];
  for (const b of boxes) {
    if (b.l >= region.l && b.l <= region.r) rawX.push(b.l);
    if (b.r >= region.l && b.r <= region.r) rawX.push(b.r);
    if (b.t >= region.t && b.t <= region.b) rawY.push(b.t);
    if (b.b >= region.t && b.b <= region.b) rawY.push(b.b);
  }
  const xs = uniqueSorted(rawX.filter((x) => x >= region.l && x <= region.r));
  const ys = uniqueSorted(rawY.filter((y) => y >= region.t && y <= region.b));
  const X = xs.length;
  const Y = ys.length;
  if (p.maxCells !== undefined && X * Y > p.maxCells) return null;
  const si = indexOf(xs, start.x);
  const sj = indexOf(ys, start.y);
  const gi = indexOf(xs, goal.x);
  const gj = indexOf(ys, goal.y);
  if (si < 0 || sj < 0 || gi < 0 || gj < 0) return null;

  const cells = X * Y;
  const blockedPt = new Uint8Array(cells);
  const blockedH = new Uint8Array(cells); // edge (i,j) -> (i+1,j)
  const blockedV = new Uint8Array(cells); // edge (i,j) -> (i,j+1)

  for (const b of boxes) {
    const iIn0 = upperBound(xs, b.l);
    const iIn1 = lowerBound(xs, b.r) - 1;
    const jIn0 = upperBound(ys, b.t);
    const jIn1 = lowerBound(ys, b.b) - 1;
    const iS = lowerBound(xs, b.l);
    const iE = upperBound(xs, b.r) - 1;
    const jS = lowerBound(ys, b.t);
    const jE = upperBound(ys, b.b) - 1;
    for (let j = jIn0; j <= jIn1; j++) {
      const row = j * X;
      for (let i = iIn0; i <= iIn1; i++) blockedPt[row + i] = 1;
      for (let i = iS; i < iE; i++) blockedH[row + i] = 1;
    }
    for (let i = iIn0; i <= iIn1; i++) {
      for (let j = jS; j < jE; j++) blockedV[j * X + i] = 1;
    }
  }
  // Endpoints may sit on or inside an obstacle edge; never block the points themselves.
  blockedPt[sj * X + si] = 0;
  blockedPt[gj * X + gi] = 0;

  const states = cells * 4;
  const g = new Float64Array(states).fill(Infinity);
  const came = new Int32Array(states).fill(-1);
  const closed = new Uint8Array(states);
  const heap = new Heap();
  const goalCell = gj * X + gi;
  const gx = goal.x;
  const gy = goal.y;

  const h = (i: number, j: number, d: Dir): number => {
    const dx = gx - xs[i]!;
    const dy = gy - ys[j]!;
    return Math.abs(dx) + Math.abs(dy) + bendPenalty * minTurns(dx, dy, d);
  };

  const startCell = sj * X + si;
  for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
    if (p.startDir !== -1 && d !== p.startDir) continue;
    const s = startCell * 4 + d;
    g[s] = 0;
    heap.push(h(si, sj, d), s);
  }

  let found = -1;
  while (heap.size > 0) {
    const s = heap.pop();
    if (closed[s]) continue;
    closed[s] = 1;
    const cell = s >> 2;
    const d = (s & 3) as Dir;
    if (cell === goalCell) {
      found = s;
      break;
    }
    const i = cell % X;
    const j = (cell - i) / X;
    const gs = g[s]!;
    const back = opposite(d);
    for (let nd = 0 as Dir; nd < 4; nd = (nd + 1) as Dir) {
      if (nd === back) continue;
      let ni = i;
      let nj = j;
      let len: number;
      if (nd === 0) {
        if (i + 1 >= X || blockedH[cell]) continue;
        ni = i + 1;
        len = xs[ni]! - xs[i]!;
      } else if (nd === 2) {
        if (i === 0 || blockedH[cell - 1]) continue;
        ni = i - 1;
        len = xs[i]! - xs[ni]!;
      } else if (nd === 1) {
        if (j + 1 >= Y || blockedV[cell]) continue;
        nj = j + 1;
        len = ys[nj]! - ys[j]!;
      } else {
        if (j === 0 || blockedV[cell - X]) continue;
        nj = j - 1;
        len = ys[j]! - ys[nj]!;
      }
      const ncell = nj * X + ni;
      if (blockedPt[ncell]) continue;
      let cost = gs + len + (nd === d ? 0 : bendPenalty);
      if (ncell === goalCell && p.goalDir !== -1 && nd !== p.goalDir) {
        cost += nd === opposite(p.goalDir) ? 2 * bendPenalty : bendPenalty;
      }
      const ns = ncell * 4 + nd;
      if (cost < g[ns]!) {
        g[ns] = cost;
        came[ns] = s;
        heap.push(cost + (ncell === goalCell ? 0 : h(ni, nj, nd)), ns);
      }
    }
  }
  if (found < 0) return null;

  const pts: Point[] = [];
  for (let s = found; s >= 0; s = came[s]!) {
    const cell = s >> 2;
    const i = cell % X;
    pts.push({ x: xs[i]!, y: ys[(cell - i) / X]! });
  }
  pts.reverse();
  return simplify(pts);
}
