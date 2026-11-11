import type { Point, Rect } from '../model/types';
import { analyzeRoutes } from './analyze';
import {
  type Box,
  type Dir,
  DX,
  DY,
  EPS,
  boxesOverlap,
  dirIndex,
  inflate,
  isHorizontal,
  opposite,
  segmentHitsBox,
  simplify,
} from './geometry';
import { searchGrid } from './grid-search';
import type {
  Crossing,
  Junction,
  RouteEndpoint,
  RouteRequest,
  RouteResult,
  Router,
  RouterOptions,
} from './types';

const CELL = 256;
/** Lanes tried on each side of a shared corridor before giving up on spreading a segment. */
const MAX_LANES = 4;
/** Parallel segments further apart than this are never bundled for reordering. */
const MAX_BUNDLE_GAP = 400;
/** Bundles larger than this are left as spread (reordering cost grows quadratically). */
const MAX_BUNDLE = 24;
/** Grid-point cap for the whole-diagram search attempt (about 6 MB of search state). */
const MAX_WORLD_CELLS = 150_000;

interface StoredRoute {
  from: string;
  to: string;
  points: Point[];
  bbox: Box;
}

interface LaneSeg {
  link: string;
  lo: number;
  hi: number;
}

/** An interior segment that `spread` considered, with the corridor coordinate it started on. */
interface SpreadSeg {
  link: string;
  k: number;
  horizontal: boolean;
  base: number;
  lo: number;
  hi: number;
}

interface BatchRoute {
  req: RouteRequest;
  pts: Point[];
}

/**
 * Orthogonal router: sparse-grid A* with bend penalties around inflated node boxes, followed by
 * greedy lane assignment that spreads parallel pipes sharing a corridor.
 *
 * Pure and DOM-free, so it also runs inside a Web Worker. It keeps the last route of each link so
 * that `updateObstacle` can report which links a moved node affects.
 */
export class OrthogonalRouter implements Router {
  readonly clearance: number;
  readonly bendPenalty: number;
  readonly spacing: number;

  private obstacles = new Map<string, Rect>();
  private boxes = new Map<string, Box>();
  private cells = new Map<number, Set<string>>();
  private routes = new Map<string, StoredRoute>();
  private nodeLinks = new Map<string, Set<string>>();
  private hLanes = new Map<number, LaneSeg[]>();
  private vLanes = new Map<number, LaneSeg[]>();

  constructor(options: RouterOptions = {}) {
    this.clearance = options.clearance ?? 12;
    this.spacing = options.spacing ?? 6;
    this.bendPenalty = options.bendPenalty ?? 4 * this.clearance;
  }

  setObstacles(obstacles: Map<string, Rect>): void {
    this.obstacles.clear();
    this.boxes.clear();
    this.cells.clear();
    for (const [id, rect] of obstacles) this.putObstacle(id, rect);
  }

  updateObstacle(nodeId: string, rect: Rect | null): string[] {
    const old = this.boxes.get(nodeId);
    this.removeObstacle(nodeId);
    if (rect) this.putObstacle(nodeId, rect);
    const next = this.boxes.get(nodeId);

    const affected = new Set(this.nodeLinks.get(nodeId) ?? []);
    for (const [id, r] of this.routes) {
      if (affected.has(id)) continue;
      // Routes that now pass through the node, or that hugged its old position (they may straighten).
      if (next && boxesOverlap(r.bbox, next) && hits(r.points, next)) affected.add(id);
      else if (old && boxesOverlap(r.bbox, old) && touches(r.points, old)) affected.add(id);
    }
    return [...affected];
  }

  adoptRoutes(requests: RouteRequest[], results: RouteResult[]): void {
    const byId = new Map(requests.map((r) => [r.linkId, r]));
    for (const res of results) {
      const req = byId.get(res.linkId);
      if (!req) continue;
      this.forget(res.linkId);
      this.store(req, res.points);
    }
  }

  removeRoutes(linkIds: string[]): void {
    for (const id of linkIds) this.forget(id);
  }

  route(requests: RouteRequest[]): RouteResult[] {
    for (const req of requests) this.forget(req.linkId);
    const batch = new Map<string, BatchRoute>();
    const segs: SpreadSeg[] = [];
    for (const req of requests) {
      const raw = this.computePath(req);
      const pts = this.spread(req, raw, segs);
      // Store a copy: `untangle` edits `pts` in place and must unregister the old lanes first.
      this.store(req, pts.slice());
      batch.set(req.linkId, { req, pts });
    }
    this.untangle(batch, segs);
    return requests.map((req) => ({ linkId: req.linkId, points: batch.get(req.linkId)!.pts }));
  }

  analyze(routes: RouteResult[]): { crossings: Crossing[]; junctions: Junction[] } {
    return analyzeRoutes(routes);
  }

  // ---------------------------------------------------------------- obstacles

  private putObstacle(id: string, rect: Rect): void {
    const box = inflate(rect, this.clearance);
    this.obstacles.set(id, rect);
    this.boxes.set(id, box);
    forCells(box, (k) => {
      let set = this.cells.get(k);
      if (!set) this.cells.set(k, (set = new Set()));
      set.add(id);
    });
  }

  private removeObstacle(id: string): void {
    const box = this.boxes.get(id);
    if (!box) return;
    forCells(box, (k) => this.cells.get(k)?.delete(id));
    this.boxes.delete(id);
    this.obstacles.delete(id);
  }

  private queryBoxes(region: Box): Box[] {
    const ids = new Set<string>();
    forCells(region, (k) => {
      const set = this.cells.get(k);
      if (set) for (const id of set) ids.add(id);
    });
    const out: Box[] = [];
    for (const id of ids) {
      const b = this.boxes.get(id)!;
      if (boxesOverlap(b, region)) out.push(b);
    }
    return out;
  }

  // ---------------------------------------------------------------- routing

  /** Point just outside the endpoint's own (inflated) node box, along the port direction. */
  private lead(e: RouteEndpoint): Point {
    const d = dirIndex(e.direction);
    const r = this.obstacles.get(e.nodeId);
    const c = this.clearance;
    const { x, y } = e.point;
    if (!r) return { x: x + DX[d] * c, y: y + DY[d] * c };
    switch (d) {
      case 0:
        return { x: Math.max(x, r.x + r.width) + c, y };
      case 1:
        return { x, y: Math.max(y, r.y + r.height) + c };
      case 2:
        return { x: Math.min(x, r.x) - c, y };
      default:
        return { x, y: Math.min(y, r.y) - c };
    }
  }

  private computePath(req: RouteRequest): Point[] {
    const fromDir = dirIndex(req.from.direction);
    const toDir = dirIndex(req.to.direction);
    const stops = [this.lead(req.from), ...(req.waypoints ?? []), this.lead(req.to)];
    const pts: Point[] = [req.from.point, stops[0]!];
    let dir: Dir = fromDir;
    for (let k = 0; k + 1 < stops.length; k++) {
      const a = stops[k]!;
      const b = stops[k + 1]!;
      const last = k + 2 === stops.length;
      // Legs after a waypoint continue in the arrival direction or turn, but never double back.
      const leg = this.searchLeg(a, dir, b, last ? opposite(toDir) : -1) ?? fallbackLeg(a, dir, b);
      for (let i = 1; i < leg.length; i++) pts.push(leg[i]!);
      dir = lastDir(leg) ?? dir;
    }
    pts.push(req.to.point);
    return simplify(pts);
  }

  private searchLeg(a: Point, startDir: Dir | -1, b: Point, goalDir: Dir | -1): Point[] | null {
    const dist = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    const base = Math.max(6 * this.clearance, dist * 0.25);
    for (const m of [base, base * 4 + 200, Infinity]) {
      let region: Box;
      if (m === Infinity) {
        region = this.worldBox(a, b);
      } else {
        region = {
          l: Math.min(a.x, b.x) - m,
          t: Math.min(a.y, b.y) - m,
          r: Math.max(a.x, b.x) + m,
          b: Math.max(a.y, b.y) + m,
        };
      }
      // An endpoint inside another node (overlapping nodes, e.g. mid-drag) cannot avoid that node;
      // let the leg pass through it instead of searching the whole diagram for an exit.
      const boxes = this.queryBoxes(region).filter(
        (box) => !segmentHitsBox(a, a, box) && !segmentHitsBox(b, b, box),
      );
      const path = searchGrid({
        start: a,
        startDir,
        goal: b,
        goalDir,
        boxes,
        region,
        bendPenalty: this.bendPenalty,
        // The whole-diagram attempt is a last resort; cap it so an unreachable goal can't allocate
        // tens of MB per search (the leg then falls back to an L-shape).
        maxCells: m === Infinity ? MAX_WORLD_CELLS : undefined,
      });
      if (path) return path;
    }
    return null;
  }

  private worldBox(a: Point, b: Point): Box {
    const w = {
      l: Math.min(a.x, b.x),
      t: Math.min(a.y, b.y),
      r: Math.max(a.x, b.x),
      b: Math.max(a.y, b.y),
    };
    for (const box of this.boxes.values()) {
      w.l = Math.min(w.l, box.l);
      w.t = Math.min(w.t, box.t);
      w.r = Math.max(w.r, box.r);
      w.b = Math.max(w.b, box.b);
    }
    const pad = 4 * this.clearance;
    return { l: w.l - pad, t: w.t - pad, r: w.r + pad, b: w.b + pad };
  }

  // ---------------------------------------------------------------- parallel spreading

  /**
   * Moves interior segments that overlap another link's collinear segment into a free lane
   * (offsets +s, -s, +2s, ...). Port segments never move. A lane is used only if the moved segment
   * and its two neighbours stay clear of every obstacle.
   */
  private spread(req: RouteRequest, raw: Point[], segs: SpreadSeg[]): Point[] {
    const pts = raw.map((p) => ({ x: p.x, y: p.y }));
    const n = pts.length;
    for (let k = 1; k + 2 < n; k++) {
      const a = pts[k]!;
      const b = pts[k + 1]!;
      const horizontal = Math.abs(a.y - b.y) < EPS;
      const c = horizontal ? a.y : a.x;
      const lo = horizontal ? Math.min(a.x, b.x) : Math.min(a.y, b.y);
      const hi = horizontal ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
      const lanes = horizontal ? this.hLanes : this.vLanes;
      segs.push({ link: req.linkId, k, horizontal, base: c, lo, hi });
      if (!occupied(lanes, c, lo, hi, req.linkId)) continue;
      for (let lane = 1; lane <= 2 * MAX_LANES; lane++) {
        const off = this.spacing * Math.ceil(lane / 2) * (lane % 2 ? 1 : -1);
        if (occupied(lanes, c + off, lo, hi, req.linkId)) continue;
        const moved = this.shifted(req, pts, k, horizontal, off);
        if (moved) {
          pts[k] = moved[k]!;
          pts[k + 1] = moved[k + 1]!;
          break;
        }
      }
    }
    return pts;
  }

  /**
   * Greedy spreading assigns lanes in request order, so parallel links can end up in the reverse of
   * their nesting order and cross each other (a stack of manifold outputs fanning out both ways).
   * Segments of different links that run side by side, with spans overlapping and no node between
   * them, form a bundle. Each bundle is reordered so that members cross as little as possible:
   * first a pairwise "which side crosses less" sort assigns the bundle's lanes, then lane swaps
   * refine it. A change is kept only if it lowers crossings (with other links nearby too) and every
   * moved segment keeps the obstacle and lane rules.
   */
  private untangle(batch: Map<string, BatchRoute>, segs: SpreadSeg[]): void {
    const dirty = new Set<string>();
    for (const bundle of this.bundles(segs)) {
      if (this.untangleBundle(batch, bundle)) for (const s of bundle) dirty.add(s.link);
    }
    for (const id of dirty) {
      const { req, pts } = batch.get(id)!;
      this.forget(id);
      this.store(req, pts);
    }
  }

  /** Groups parallel segments of different links whose spans overlap with free space between them. */
  private bundles(segs: SpreadSeg[]): SpreadSeg[][] {
    const parent = segs.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
    const coordOf = (s: SpreadSeg) => s.base;
    const order = segs.map((_, i) => i).sort((a, b) => coordOf(segs[a]!) - coordOf(segs[b]!));
    for (let x = 0; x < order.length; x++) {
      const a = segs[order[x]!]!;
      for (let y = x + 1; y < order.length; y++) {
        const b = segs[order[y]!]!;
        if (coordOf(b) - coordOf(a) > MAX_BUNDLE_GAP) break;
        if (a.horizontal !== b.horizontal || a.link === b.link) continue;
        const lo = Math.max(a.lo, b.lo);
        const hi = Math.min(a.hi, b.hi);
        if (hi - lo < EPS) continue;
        const c0 = coordOf(a);
        const c1 = coordOf(b);
        const between: Box = a.horizontal
          ? { l: lo, t: c0, r: hi, b: c1 }
          : { l: c0, t: lo, r: c1, b: hi };
        if (this.queryBoxes(between).some((box) => boxesOverlap(box, shrink(between)))) continue;
        parent[find(order[x]!)] = find(order[y]!);
      }
    }
    const groups = new Map<number, SpreadSeg[]>();
    segs.forEach((s, i) => {
      const r = find(i);
      let g = groups.get(r);
      if (!g) groups.set(r, (g = []));
      g.push(s);
    });
    return [...groups.values()].filter(
      (g) =>
        g.length > 1 && g.length <= MAX_BUNDLE && new Set(g.map((s) => s.link)).size === g.length,
    );
  }

  private untangleBundle(batch: Map<string, BatchRoute>, bundle: SpreadSeg[]): boolean {
    const n = bundle.length;
    const horizontal = bundle[0]!.horizontal;
    const paths = bundle.map((s) => batch.get(s.link)!);
    const local = () => bundle.map((s, i) => paths[i]!.pts.slice(s.k - 1, s.k + 3));
    const coord = (i: number) => {
      const p = paths[i]!.pts[bundle[i]!.k]!;
      return horizontal ? p.y : p.x;
    };
    // Other links nearby: a reorder must not trade bundle crossings for crossings with them.
    const members = new Set(bundle.map((s) => s.link));
    const area = { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity };
    for (const pts of local()) for (const p of pts) extend(area, p);
    const context: Point[][] = [];
    for (const [id, r] of batch) {
      if (members.has(id)) continue;
      const box = { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity };
      for (const p of r.pts) extend(box, p);
      if (boxesOverlap(box, area)) context.push(r.pts);
    }
    const count = () => {
      const mine = local();
      let c = countCrossings(mine);
      for (const m of mine) for (const o of context) c += countCrossings([m, o]);
      return c;
    };
    const best = count();
    if (best === 0) return false;
    const lanes = horizontal ? this.hLanes : this.vLanes;

    /** Moves members to `target` coordinates, or returns false (and changes nothing) if not allowed. */
    const place = (target: number[]): boolean => {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const a = bundle[i]!;
          const b = bundle[j]!;
          if (Math.abs(target[i]! - target[j]!) < EPS && a.lo < b.hi - EPS && b.lo < a.hi - EPS)
            return false;
        }
      }
      const moved: (Point[] | null)[] = [];
      for (let i = 0; i < n; i++) {
        const s = bundle[i]!;
        const off = target[i]! - coord(i);
        if (Math.abs(off) < EPS) {
          moved.push(null);
          continue;
        }
        if (occupiedExcept(lanes, target[i]!, s.lo, s.hi, members)) return false;
        const m = this.shifted(paths[i]!.req, paths[i]!.pts, s.k, horizontal, off);
        if (!m) return false;
        moved.push(m);
      }
      moved.forEach((m, i) => {
        if (!m) return;
        const k = bundle[i]!.k;
        paths[i]!.pts[k] = m[k]!;
        paths[i]!.pts[k + 1] = m[k + 1]!;
      });
      return true;
    };
    /** Crossings with members at `target`, or null if not allowed. Leaves the paths unchanged. */
    const cost = (target: number[]): number | null => {
      const saved = bundle.map((s, i) => [paths[i]!.pts[s.k]!, paths[i]!.pts[s.k + 1]!] as const);
      if (!place(target)) return null;
      const c = count();
      bundle.forEach((s, i) => {
        [paths[i]!.pts[s.k], paths[i]!.pts[s.k + 1]] = saved[i]!;
      });
      return c;
    };

    // 1. Pairwise order: put i before j when that crosses less (ties keep the current order).
    const current = bundle.map((_, i) => coord(i));
    const slots = [...current].sort((a, b) => a - b);
    const pairCost = (i: number, ci: number, j: number, cj: number) => {
      const at = (idx: number, c: number) => {
        const s = bundle[idx]!;
        const pts = paths[idx]!.pts.slice(s.k - 1, s.k + 3).map((p) => ({ ...p }));
        if (horizontal) pts[1]!.y = pts[2]!.y = c;
        else pts[1]!.x = pts[2]!.x = c;
        return pts;
      };
      return countCrossings([at(i, ci), at(j, cj)]);
    };
    const lowC = slots[0]!;
    const highC = slots[n - 1]!;
    // Strict preferences only (pairs that cross less one way round), then a topological order that
    // breaks ties by the current position, so members that don't interact keep their places.
    const after: number[][] = bundle.map(() => []);
    const indegree = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const ij = pairCost(i, lowC, j, highC);
        const ji = pairCost(j, lowC, i, highC);
        if (ij === ji) continue;
        const [first, second] = ij < ji ? [i, j] : [j, i];
        after[first]!.push(second);
        indegree[second]!++;
      }
    }
    const order: number[] = [];
    const placed = new Set<number>();
    while (order.length < n) {
      let next = -1;
      for (let i = 0; i < n; i++) {
        if (placed.has(i) || indegree[i]! > 0) continue;
        if (next < 0 || current[i]! < current[next]!) next = i;
      }
      // A preference cycle: take the leftmost remaining member as is.
      if (next < 0) {
        for (let i = 0; i < n; i++) {
          if (!placed.has(i) && (next < 0 || current[i]! < current[next]!)) next = i;
        }
      }
      placed.add(next);
      order.push(next);
      for (const j of after[next]!) indegree[j]!--;
    }
    // Lanes for that order: the bundle's own lanes, or packed against either side within how far each
    // member can actually move (members that shared a lane on separate spans may now need one each).
    const step = this.spacing;
    const layouts: number[][] = [];
    const byRank = (lanesFor: number[]) => {
      const t: number[] = new Array<number>(n);
      order.forEach((idx, rank) => (t[idx] = lanesFor[rank]!));
      return t;
    };
    layouts.push(byRank(slots));
    const reach = (i: number, dir: 1 | -1) => {
      const s = bundle[i]!;
      let c = current[i]!;
      for (let k = 1; k * step <= MAX_BUNDLE_GAP; k++) {
        const next = current[i]! + dir * k * step;
        if (occupiedExcept(lanes, next, s.lo, s.hi, members)) break;
        if (!this.shifted(paths[i]!.req, paths[i]!.pts, s.k, horizontal, next - current[i]!)) break;
        c = next;
      }
      return c;
    };
    const hiReach = bundle.map((_, i) => reach(i, 1));
    const loReach = bundle.map((_, i) => reach(i, -1));
    const packHigh: number[] = new Array<number>(n);
    let ok = true;
    for (let r = n - 1, next = Infinity; r >= 0; r--) {
      const idx = order[r]!;
      next = Math.min(hiReach[idx]!, next - step);
      if (next < loReach[idx]! - EPS) ok = false;
      packHigh[idx] = next;
    }
    if (ok) layouts.push(packHigh);
    const packLow: number[] = new Array<number>(n);
    ok = true;
    for (let r = 0, next = -Infinity; r < n; r++) {
      const idx = order[r]!;
      next = Math.max(loReach[idx]!, next + step);
      if (next > hiReach[idx]! + EPS) ok = false;
      packLow[idx] = next;
    }
    if (ok) layouts.push(packLow);
    let pick: number[] | null = null;
    let pickCost = best;
    for (const t of layouts) {
      const c = cost(t);
      if (c !== null && c < pickCost) {
        pick = t;
        pickCost = c;
      }
    }
    return !!pick && place(pick);
  }

  /** The path with segment k moved by `off`, or null when that breaks a neighbour or hits a node. */
  private shifted(
    req: RouteRequest,
    pts: Point[],
    k: number,
    horizontal: boolean,
    off: number,
  ): Point[] | null {
    const n = pts.length;
    const moved = pts.map((p, i) =>
      i === k || i === k + 1
        ? horizontal
          ? { x: p.x, y: p.y + off }
          : { x: p.x + off, y: p.y }
        : p,
    );
    // Neighbouring segments must keep their direction and a minimal length.
    for (const [i, j] of [
      [k - 1, k],
      [k + 1, k + 2],
    ] as const) {
      const before = horizontal ? pts[j]!.y - pts[i]!.y : pts[j]!.x - pts[i]!.x;
      const after = horizontal ? moved[j]!.y - moved[i]!.y : moved[j]!.x - moved[i]!.x;
      if (Math.sign(before) !== Math.sign(after) || Math.abs(after) < this.spacing / 2) return null;
    }
    const fromBox = this.boxes.get(req.from.nodeId);
    const toBox = this.boxes.get(req.to.nodeId);
    for (let s = Math.max(0, k - 1); s <= Math.min(n - 2, k + 1); s++) {
      const a = moved[s]!;
      const b = moved[s + 1]!;
      const region = {
        l: Math.min(a.x, b.x),
        t: Math.min(a.y, b.y),
        r: Math.max(a.x, b.x),
        b: Math.max(a.y, b.y),
      };
      for (const box of this.queryBoxes(region)) {
        // Port segments run inside their own node's clearance by design.
        if ((s === 0 && box === fromBox) || (s === n - 2 && box === toBox)) continue;
        if (segmentHitsBox(a, b, box)) return null;
      }
    }
    return moved;
  }

  // ---------------------------------------------------------------- bookkeeping

  private store(req: RouteRequest, points: Point[]): void {
    const bbox = { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity };
    for (const p of points) {
      bbox.l = Math.min(bbox.l, p.x);
      bbox.t = Math.min(bbox.t, p.y);
      bbox.r = Math.max(bbox.r, p.x);
      bbox.b = Math.max(bbox.b, p.y);
    }
    this.routes.set(req.linkId, { from: req.from.nodeId, to: req.to.nodeId, points, bbox });
    for (const node of [req.from.nodeId, req.to.nodeId]) {
      let set = this.nodeLinks.get(node);
      if (!set) this.nodeLinks.set(node, (set = new Set()));
      set.add(req.linkId);
    }
    eachSeg(points, (horizontal, c, lo, hi) => {
      const lanes = horizontal ? this.hLanes : this.vLanes;
      const k = laneKey(c);
      let list = lanes.get(k);
      if (!list) lanes.set(k, (list = []));
      list.push({ link: req.linkId, lo, hi });
    });
  }

  private forget(linkId: string): void {
    const r = this.routes.get(linkId);
    if (!r) return;
    this.routes.delete(linkId);
    this.nodeLinks.get(r.from)?.delete(linkId);
    this.nodeLinks.get(r.to)?.delete(linkId);
    eachSeg(r.points, (horizontal, c) => {
      const lanes = horizontal ? this.hLanes : this.vLanes;
      const k = laneKey(c);
      const list = lanes.get(k);
      if (!list) return;
      const next = list.filter((s) => s.link !== linkId);
      if (next.length) lanes.set(k, next);
      else lanes.delete(k);
    });
  }
}

/** Creates the default orthogonal router. */
export function createRouter(options?: RouterOptions): OrthogonalRouter {
  return new OrthogonalRouter(options);
}

// ------------------------------------------------------------------ helpers

function forCells(box: Box, fn: (key: number) => void): void {
  const x0 = Math.floor(box.l / CELL);
  const x1 = Math.floor(box.r / CELL);
  const y0 = Math.floor(box.t / CELL);
  const y1 = Math.floor(box.b / CELL);
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) fn((x + 32768) * 65536 + (y + 32768));
  }
}

const laneKey = (c: number): number => Math.round(c * 8);

function occupied(
  lanes: Map<number, LaneSeg[]>,
  c: number,
  lo: number,
  hi: number,
  self: string,
): boolean {
  const list = lanes.get(laneKey(c));
  if (!list) return false;
  for (const s of list) {
    if (s.link !== self && s.lo < hi - EPS && lo < s.hi - EPS) return true;
  }
  return false;
}

function occupiedExcept(
  lanes: Map<number, LaneSeg[]>,
  c: number,
  lo: number,
  hi: number,
  except: Set<string>,
): boolean {
  const list = lanes.get(laneKey(c));
  if (!list) return false;
  for (const s of list) {
    if (!except.has(s.link) && s.lo < hi - EPS && lo < s.hi - EPS) return true;
  }
  return false;
}

/** Grows a box to include a point. */
function extend(box: Box, p: Point): void {
  box.l = Math.min(box.l, p.x);
  box.t = Math.min(box.t, p.y);
  box.r = Math.max(box.r, p.x);
  box.b = Math.max(box.b, p.y);
}

/** The box minus a hair on every side, so boxes that only touch its edge don't count. */
function shrink(b: Box): Box {
  return { l: b.l + 0.5, t: b.t + 0.5, r: b.r - 0.5, b: b.b - 0.5 };
}

/** Proper crossings between the polylines of different paths (shared endpoints don't count). */
function countCrossings(paths: Point[][]): number {
  let count = 0;
  for (let i = 0; i < paths.length; i++) {
    for (let j = i + 1; j < paths.length; j++) {
      const p = paths[i]!;
      const q = paths[j]!;
      for (let a = 0; a + 1 < p.length; a++) {
        for (let b = 0; b + 1 < q.length; b++) {
          if (crosses(p[a]!, p[a + 1]!, q[b]!, q[b + 1]!)) count++;
        }
      }
    }
  }
  return count;
}

function crosses(a: Point, b: Point, c: Point, d: Point): boolean {
  const h1 = Math.abs(a.y - b.y) < EPS;
  const h2 = Math.abs(c.y - d.y) < EPS;
  if (h1 === h2) return false;
  const [h0, h3, v0, v3] = h1 ? [a, b, c, d] : [c, d, a, b];
  const y = h0.y;
  const x = v0.x;
  return (
    x > Math.min(h0.x, h3.x) + EPS &&
    x < Math.max(h0.x, h3.x) - EPS &&
    y > Math.min(v0.y, v3.y) + EPS &&
    y < Math.max(v0.y, v3.y) - EPS
  );
}

function eachSeg(
  pts: Point[],
  fn: (horizontal: boolean, c: number, lo: number, hi: number) => void,
): void {
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k]!;
    const b = pts[k + 1]!;
    if (Math.abs(a.y - b.y) < EPS) fn(true, a.y, Math.min(a.x, b.x), Math.max(a.x, b.x));
    else fn(false, a.x, Math.min(a.y, b.y), Math.max(a.y, b.y));
  }
}

function hits(pts: Point[], box: Box): boolean {
  for (let k = 0; k + 1 < pts.length; k++)
    if (segmentHitsBox(pts[k]!, pts[k + 1]!, box)) return true;
  return false;
}

/** True when the polyline enters or runs along the closed box (within 1 unit). */
function touches(pts: Point[], box: Box): boolean {
  const grown = { l: box.l - 1, t: box.t - 1, r: box.r + 1, b: box.b + 1 };
  return hits(pts, grown);
}

function lastDir(leg: Point[]): Dir | null {
  if (leg.length < 2) return null;
  const a = leg[leg.length - 2]!;
  const b = leg[leg.length - 1]!;
  if (Math.abs(a.y - b.y) < EPS) return b.x > a.x ? 0 : 2;
  return b.y > a.y ? 1 : 3;
}

/** Obstacle-blind L-shaped leg, used only when no path exists (e.g. an endpoint inside another node). */
function fallbackLeg(a: Point, dir: Dir, b: Point): Point[] {
  const corner = isHorizontal(dir) ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
  return simplify([a, corner, b]);
}
