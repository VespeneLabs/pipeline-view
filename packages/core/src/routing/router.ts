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
   * their nesting order and cross each other (a stack of manifold outputs turning the same way).
   * For each bundle of segments spread from one corridor, swap lanes between members while that
   * lowers the number of crossings among the bundle. Swaps keep every obstacle and lane rule.
   */
  private untangle(batch: Map<string, BatchRoute>, segs: SpreadSeg[]): void {
    const groups = new Map<string, SpreadSeg[]>();
    for (const s of segs) {
      const key = `${s.horizontal ? 'h' : 'v'}${laneKey(s.base)}`;
      let list = groups.get(key);
      if (!list) groups.set(key, (list = []));
      list.push(s);
    }
    const dirty = new Set<string>();
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      for (const bundle of overlapComponents(list)) {
        if (bundle.length < 2 || new Set(bundle.map((s) => s.link)).size !== bundle.length)
          continue;
        if (this.untangleBundle(batch, bundle)) for (const s of bundle) dirty.add(s.link);
      }
    }
    for (const id of dirty) {
      const { req, pts } = batch.get(id)!;
      this.forget(id);
      this.store(req, pts);
    }
  }

  private untangleBundle(batch: Map<string, BatchRoute>, bundle: SpreadSeg[]): boolean {
    const paths = bundle.map((s) => batch.get(s.link)!);
    const local = () => bundle.map((s, i) => paths[i]!.pts.slice(s.k - 1, s.k + 3));
    const coord = (i: number) => {
      const p = paths[i]!.pts[bundle[i]!.k]!;
      return bundle[i]!.horizontal ? p.y : p.x;
    };
    let best = countCrossings(local());
    if (best === 0) return false;
    const members = new Set(bundle.map((s) => s.link));
    const lanes = bundle[0]!.horizontal ? this.hLanes : this.vLanes;
    let changed = false;
    let improved = true;
    for (let pass = 0; improved && pass < bundle.length * bundle.length; pass++) {
      improved = false;
      for (let i = 0; i < bundle.length && best > 0; i++) {
        for (let j = i + 1; j < bundle.length && best > 0; j++) {
          const a = bundle[i]!;
          const b = bundle[j]!;
          const ca = coord(i);
          const cb = coord(j);
          if (Math.abs(ca - cb) < EPS) continue;
          if (occupiedExcept(lanes, cb, a.lo, a.hi, members)) continue;
          if (occupiedExcept(lanes, ca, b.lo, b.hi, members)) continue;
          const pa = paths[i]!;
          const pb = paths[j]!;
          const ma = this.shifted(pa.req, pa.pts, a.k, a.horizontal, cb - ca);
          const mb = ma && this.shifted(pb.req, pb.pts, b.k, b.horizontal, ca - cb);
          if (!ma || !mb) continue;
          const saved = [pa.pts[a.k]!, pa.pts[a.k + 1]!, pb.pts[b.k]!, pb.pts[b.k + 1]!] as const;
          pa.pts[a.k] = ma[a.k]!;
          pa.pts[a.k + 1] = ma[a.k + 1]!;
          pb.pts[b.k] = mb[b.k]!;
          pb.pts[b.k + 1] = mb[b.k + 1]!;
          const count = countCrossings(local());
          if (count < best) {
            best = count;
            improved = changed = true;
          } else {
            [pa.pts[a.k], pa.pts[a.k + 1], pb.pts[b.k], pb.pts[b.k + 1]] = saved;
          }
        }
      }
    }
    return changed;
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

/** Splits segments on one corridor into groups whose spans overlap (transitively). */
function overlapComponents(list: SpreadSeg[]): SpreadSeg[][] {
  const sorted = [...list].sort((a, b) => a.lo - b.lo);
  const out: SpreadSeg[][] = [];
  let cur: SpreadSeg[] = [];
  let end = -Infinity;
  for (const s of sorted) {
    if (cur.length && s.lo >= end - EPS) {
      out.push(cur);
      cur = [];
      end = -Infinity;
    }
    cur.push(s);
    end = Math.max(end, s.hi);
  }
  if (cur.length) out.push(cur);
  return out;
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
