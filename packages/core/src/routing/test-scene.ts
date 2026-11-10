/** Test-only helpers for building routing scenes. Not exported from the package. */
import type { Point, Rect } from '../model/types';
import type { PortDirection } from '../symbols/types';
import type { RouteEndpoint, RouteRequest } from './types';

export interface SceneNode {
  id: string;
  rect: Rect;
}

export interface SceneLink {
  id: string;
  from: { node: string; side: PortDirection };
  to: { node: string; side: PortDirection };
}

export const SIDES: PortDirection[] = ['left', 'right', 'top', 'bottom'];

/** Port at the middle of the given side of a rect. */
export function portOf(rect: Rect, side: PortDirection): Point {
  switch (side) {
    case 'left':
      return { x: rect.x, y: rect.y + rect.height / 2 };
    case 'right':
      return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
    case 'top':
      return { x: rect.x + rect.width / 2, y: rect.y };
    default:
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
  }
}

export function endpoint(
  nodes: Map<string, Rect>,
  node: string,
  side: PortDirection,
): RouteEndpoint {
  return { nodeId: node, direction: side, point: portOf(nodes.get(node)!, side) };
}

export function requestsFor(nodes: Map<string, Rect>, links: SceneLink[]): RouteRequest[] {
  return links.map((l) => ({
    linkId: l.id,
    from: endpoint(nodes, l.from.node, l.from.side),
    to: endpoint(nodes, l.to.node, l.to.side),
  }));
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A plant-like scene: nodes jittered on a grid (always separated by more than 2 x clearance),
 * links between nearby nodes.
 */
export function generateScene(
  nodeCount: number,
  linkCount: number,
  seed = 1,
): { nodes: Map<string, Rect>; links: SceneLink[] } {
  const rand = rng(seed);
  const cols = Math.ceil(Math.sqrt(nodeCount * 1.25));
  const cellW = 200;
  const cellH = 160;
  const nodes = new Map<string, Rect>();
  for (let i = 0; i < nodeCount; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const width = 30 + Math.round(rand() * 70);
    const height = 24 + Math.round(rand() * 56);
    const x = c * cellW + 20 + Math.round(rand() * (cellW - 60 - width));
    const y = r * cellH + 20 + Math.round(rand() * (cellH - 60 - height));
    nodes.set(`n${i}`, { x, y, width, height });
  }
  const links: SceneLink[] = [];
  for (let i = 0; i < linkCount; i++) {
    const a = Math.floor(rand() * nodeCount);
    const ac = a % cols;
    const ar = Math.floor(a / cols);
    let b = a;
    while (b === a || b >= nodeCount) {
      const bc = Math.min(cols - 1, Math.max(0, ac + Math.round((rand() - 0.5) * 6)));
      const br = Math.max(0, ar + Math.round((rand() - 0.5) * 6));
      b = br * cols + bc;
    }
    links.push({
      id: `l${i}`,
      from: { node: `n${a}`, side: SIDES[Math.floor(rand() * 4)]! },
      to: { node: `n${b}`, side: SIDES[Math.floor(rand() * 4)]! },
    });
  }
  return { nodes, links };
}
