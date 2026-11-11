/**
 * Comparing two versions of a model (FR-51). Pure functions, safe to use on the server.
 */
import type { DiffMark, ModelComparison } from '../diagram/types';
import type { DiagramModel, LinkModel, NodeModel } from './types';

export interface GetDiffOptions {
  /**
   * Top-level node and link fields to leave out of the comparison. Default `['status']`, because status
   * is live state rather than part of the design. Add `'data'` to compare structure only.
   */
  ignore?: string[];
}

/** Fields whose change counts as "moved" rather than "changed". */
const NODE_GEOMETRY = new Set(['position', 'rotation', 'flipX', 'flipY']);
const LINK_GEOMETRY = new Set(['waypoints', 'routing', 'fromAttach', 'toAttach']);

/**
 * Lists how `current` differs from `base`, item by item:
 * - `added`: only in current;
 * - `removed`: only in base;
 * - `moved`: only geometry changed (nodes: position, rotation, flips; links: waypoints, routing, and
 *   the ends attached to another link);
 * - `changed`: anything else changed (type, label, ports, data, kind, ends, …), with or without a move.
 *
 * Unchanged items are left out. Items are listed in current's order, then removed items in base's order.
 */
export function getDiff(
  base: DiagramModel,
  current: DiagramModel,
  opts: GetDiffOptions = {},
): ModelComparison {
  const ignore = new Set(opts.ignore ?? ['status']);
  return {
    nodes: compareItems(base.nodes, current.nodes, NODE_GEOMETRY, ignore),
    links: compareItems(base.links, current.links, LINK_GEOMETRY, ignore),
  };
}

function compareItems<T extends NodeModel | LinkModel>(
  base: readonly T[],
  current: readonly T[],
  geometry: Set<string>,
  ignore: Set<string>,
): { id: string; mark: DiffMark }[] {
  const before = new Map(base.map((x) => [x.id, x]));
  const now = new Set(current.map((x) => x.id));
  const out: { id: string; mark: DiffMark }[] = [];
  for (const item of current) {
    const old = before.get(item.id);
    if (!old) {
      out.push({ id: item.id, mark: 'added' });
      continue;
    }
    const mark = compareItem(old, item, geometry, ignore);
    if (mark) out.push({ id: item.id, mark });
  }
  for (const item of base) if (!now.has(item.id)) out.push({ id: item.id, mark: 'removed' });
  return out;
}

function compareItem(
  a: NodeModel | LinkModel,
  b: NodeModel | LinkModel,
  geometry: Set<string>,
  ignore: Set<string>,
): 'moved' | 'changed' | null {
  let moved = false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (ignore.has(k)) continue;
    const x = (a as unknown as Record<string, unknown>)[k];
    const y = (b as unknown as Record<string, unknown>)[k];
    if (equal(normalize(k, x), normalize(k, y))) continue;
    if (!geometry.has(k)) return 'changed';
    moved = true;
  }
  return moved ? 'moved' : null;
}

/** Treats the defaults as equal to the field being absent, so `rotation: 0` matches no rotation. */
function normalize(key: string, v: unknown): unknown {
  if (v === undefined) return undefined;
  if ((key === 'rotation' && v === 0) || ((key === 'flipX' || key === 'flipY') && v === false))
    return undefined;
  if (key === 'routing' && v === 'auto') return undefined;
  if (key === 'waypoints' && Array.isArray(v) && v.length === 0) return undefined;
  return v;
}

/** Structural equality for JSON values (object key order doesn't matter). */
export function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => equal(x, bb[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ka = Object.keys(ao).filter((k) => ao[k] !== undefined);
  const kb = Object.keys(bo).filter((k) => bo[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => equal(ao[k], bo[k]));
}
