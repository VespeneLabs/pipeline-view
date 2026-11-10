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
