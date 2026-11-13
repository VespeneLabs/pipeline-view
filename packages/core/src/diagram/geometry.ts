/**
 * Pure node geometry: rotation and flip, shared by the renderer, router integration and the editor.
 * A node's `position` is the top-left of its unrotated box. Rotation and flip happen about the box center.
 */
import type { NodeModel, Point, Rect, Size } from '../model/types';
import type { PortDirection, SymbolDef } from '../symbols/types';
import { findPort, nodePorts, nodeSize } from '../symbols/resolve';

export { FALLBACK_SIZE } from '../symbols/resolve';

/** Unrotated size of a node (per instance when the symbol computes it, FR-40). */
export const symbolSize = (def: SymbolDef | undefined, node?: NodeModel): Size =>
  nodeSize(def, node);

const rot = (node: NodeModel) => (((node.rotation ?? 0) % 360) + 360) % 360;

/** Axis-aligned bounding box after rotation. */
export function nodeBounds(node: NodeModel, def: SymbolDef | undefined): Rect {
  const { width: w, height: h } = symbolSize(def, node);
  const swap = rot(node) === 90 || rot(node) === 270;
  const bw = swap ? h : w;
  const bh = swap ? w : h;
  return {
    x: node.position.x + (w - bw) / 2,
    y: node.position.y + (h - bh) / 2,
    width: bw,
    height: bh,
  };
}

/** Maps a point from symbol-local coordinates (0..size) to diagram coordinates. */
export function localToDiagram(node: NodeModel, def: SymbolDef | undefined, p: Point): Point {
  const { width: w, height: h } = symbolSize(def, node);
  let dx = (node.flipX ? w - p.x : p.x) - w / 2;
  let dy = (node.flipY ? h - p.y : p.y) - h / 2;
  // SVG is y-down, so a positive rotation is clockwise: (1,0) -> (0,1) at 90°.
  switch (rot(node)) {
    case 90:
      [dx, dy] = [-dy, dx];
      break;
    case 180:
      [dx, dy] = [-dx, -dy];
      break;
    case 270:
      [dx, dy] = [dy, -dx];
      break;
  }
  return { x: node.position.x + w / 2 + dx, y: node.position.y + h / 2 + dy };
}

const CW: Record<PortDirection, PortDirection> = {
  right: 'bottom',
  bottom: 'left',
  left: 'top',
  top: 'right',
};

export function transformDirection(node: NodeModel, d: PortDirection): PortDirection {
  if (node.flipX && (d === 'left' || d === 'right')) d = d === 'left' ? 'right' : 'left';
  if (node.flipY && (d === 'top' || d === 'bottom')) d = d === 'top' ? 'bottom' : 'top';
  for (let r = rot(node); r > 0; r -= 90) d = CW[d];
  return d;
}

export interface ResolvedPort {
  id: string;
  point: Point;
  direction: PortDirection;
}

/** A port's diagram position and outward direction, or undefined if the symbol has no such port. */
export function portPoint(
  node: NodeModel,
  def: SymbolDef | undefined,
  portId: string,
): ResolvedPort | undefined {
  const p = findPort(def, node, portId);
  if (!p) return undefined;
  return {
    id: p.id,
    point: localToDiagram(node, def, p.position),
    direction: transformDirection(node, p.direction),
  };
}

const STEP: Record<PortDirection, Point> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
};
/** How far out of a port a link is taken to run before it can turn, when comparing a port's places. */
const PORT_LEAD = 24;

/**
 * Like `portPoint`, for a link whose other end is at `toward`: of the port's `position` and its
 * `alternates`, the place a pipe reaches `toward` from most directly. Ties go to the earlier place.
 */
export function portPointToward(
  node: NodeModel,
  def: SymbolDef | undefined,
  portId: string,
  toward: Point,
): ResolvedPort | undefined {
  const p = findPort(def, node, portId);
  if (!p) return undefined;
  let best: ResolvedPort | undefined;
  let bestCost = Infinity;
  for (const place of [p, ...(p.alternates ?? [])]) {
    const point = localToDiagram(node, def, place.position);
    const direction = transformDirection(node, place.direction);
    const cost =
      Math.abs(toward.x - point.x - STEP[direction].x * PORT_LEAD) +
      Math.abs(toward.y - point.y - STEP[direction].y * PORT_LEAD);
    if (cost < bestCost) {
      bestCost = cost;
      best = { id: p.id, point, direction };
    }
  }
  return best;
}

export function resolvePorts(node: NodeModel, def: SymbolDef | undefined): ResolvedPort[] {
  return nodePorts(def, node).map((p) => ({
    id: p.id,
    point: localToDiagram(node, def, p.position),
    direction: transformDirection(node, p.direction),
  }));
}

/** SVG transform for a node group whose children are drawn in local coordinates. */
export function nodeTransform(node: NodeModel, def: SymbolDef | undefined): string {
  const { width: w, height: h } = symbolSize(def, node);
  let t = `translate(${node.position.x},${node.position.y})`;
  const r = rot(node);
  if (r) t += ` rotate(${r},${w / 2},${h / 2})`;
  if (node.flipX || node.flipY) {
    t += ` translate(${node.flipX ? w : 0},${node.flipY ? h : 0}) scale(${node.flipX ? -1 : 1},${node.flipY ? -1 : 1})`;
  }
  return t;
}

const LABEL_GAP = 16;
/** Estimated node-label metrics (600 weight, --pv-font-size-label 14px). */
const LABEL_CHAR_WIDTH = 8.5;
const LABEL_ASCENT = 13;
const LABEL_HEIGHT = 17;

/** Where a node's label is drawn: its baseline point and which end of the text sits there. */
export interface LabelPlacement extends Point {
  anchor: 'start' | 'middle' | 'end';
}

/** Sides tried by `labelPosition: 'auto'`, in order. */
const AUTO_SIDES: PortDirection[] = ['bottom', 'top', 'right', 'left'];
/** Space between a symbol and a label beside it. */
const LABEL_SIDE_GAP = 6;

/**
 * Where a node's label is drawn, or null without a label. `labelPosition` (the node's, else the
 * symbol's) names a side of the node as it is drawn, so it holds at every rotation and flip; 'auto'
 * takes the first of bottom, top, right, left that none of the node's ports faces. Without it the
 * label sits at the symbol's `labelAnchor`, or below the node.
 */
export function nodeLabelPlacement(
  node: NodeModel,
  def: SymbolDef | undefined,
): LabelPlacement | null {
  if (!node.label) return null;
  let side = node.labelPosition ?? def?.labelPosition;
  if (!side && def?.labelAnchor)
    return { ...localToDiagram(node, def, def.labelAnchor), anchor: 'middle' };
  if (side === 'auto') {
    const taken = new Set(nodePorts(def, node).map((p) => transformDirection(node, p.direction)));
    side = AUTO_SIDES.find((s) => !taken.has(s));
  }
  const b = nodeBounds(node, def);
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2 + LABEL_ASCENT - LABEL_HEIGHT / 2;
  switch (side) {
    case 'top':
      return { x, y: b.y - LABEL_GAP + 2 * LABEL_ASCENT - LABEL_HEIGHT, anchor: 'middle' };
    case 'left':
      return { x: b.x - LABEL_SIDE_GAP, y, anchor: 'end' };
    case 'right':
      return { x: b.x + b.width + LABEL_SIDE_GAP, y, anchor: 'start' };
    default:
      return { x, y: b.y + b.height + LABEL_GAP, anchor: 'middle' };
  }
}

/** The point a node's label is drawn at (its baseline), or null without a label. See `nodeLabelPlacement`. */
export function nodeLabelAnchor(node: NodeModel, def: SymbolDef | undefined): Point | null {
  const at = nodeLabelPlacement(node, def);
  return at && { x: at.x, y: at.y };
}

/**
 * The box a node's label takes, or null without a label. It's estimated from the text length, so it
 * needs no layout read and works without a DOM. Routing around labels and `getBounds()` both use it.
 */
export function nodeLabelBox(node: NodeModel, def: SymbolDef | undefined): Rect | null {
  const at = nodeLabelPlacement(node, def);
  if (!at) return null;
  const width = node.label!.length * LABEL_CHAR_WIDTH;
  const x = at.anchor === 'middle' ? at.x - width / 2 : at.anchor === 'end' ? at.x - width : at.x;
  return { x, y: at.y - LABEL_ASCENT, width, height: LABEL_HEIGHT };
}

export function unionRects(rects: Iterable<Rect>): Rect | undefined {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const r of rects) {
    x1 = Math.min(x1, r.x);
    y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.width);
    y2 = Math.max(y2, r.y + r.height);
  }
  return x1 === Infinity ? undefined : { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}
