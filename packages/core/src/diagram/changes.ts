/**
 * JSON patches for controlled mode and host-owned history (FR-44).
 * - ChangeTracker records each touched item's state before its first change, so a transaction (or an
 *   undo/redo/preview) can be turned into a forward and an inverse ModelPatch.
 * - applyPatchTx applies a ModelPatch through a Transaction (undo, hooks and rendering work as usual).
 * - diffModels computes the patch from the current model to a target model, ignoring live data.
 */
import type {
  AnnotationModel,
  CollectionPatch,
  DataRecord,
  DiagramModel,
  ItemChange,
  LinkModel,
  ModelPatch,
  NodeModel,
} from '../model/types';
import type { AnyItem, Collection, ModelStore } from '../model/store';
import type { Op } from './transaction';
import type { Transaction } from './types';

const clone = <T>(v: T): T => structuredClone(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Keys of one item whose values differ; removed keys map to null. Null when nothing differs. */
export function itemChange<T extends { id: string }>(before: T, after: T): ItemChange<T> | null {
  const out: Record<string, unknown> = { id: after.id };
  let changed = false;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    if (k === 'id') continue;
    const a = (before as Record<string, unknown>)[k];
    const b = (after as Record<string, unknown>)[k];
    if (same(a, b)) continue;
    out[k] = b === undefined ? null : clone(b);
    changed = true;
  }
  return changed ? (out as ItemChange<T>) : null;
}

export const isEmptyPatch = (p: ModelPatch): boolean =>
  (['nodes', 'links', 'annotations'] as const).every((c) => {
    const cp = p[c];
    return !cp || !(cp.added?.length || cp.removed?.length || cp.changed?.length);
  }) && p.meta === undefined;

function push(
  patch: ModelPatch,
  c: Collection,
  kind: keyof CollectionPatch<{ id: string }>,
  value: unknown,
) {
  const cp = ((patch as Record<Collection, Record<string, unknown[]>>)[c] ??= {});
  (cp[kind] ??= []).push(value);
}

/** Patch turning `before` items into `after` items (both keyed by collection + id). */
function patchBetween(
  entries: Iterable<{ c: Collection; id: string; before?: AnyItem; after?: AnyItem }>,
): ModelPatch {
  const patch: ModelPatch = {};
  for (const { c, id, before, after } of entries) {
    if (!before && after) push(patch, c, 'added', clone(after));
    else if (before && !after) push(patch, c, 'removed', id);
    else if (before && after) {
      const ch = itemChange(before as { id: string }, after as { id: string });
      if (ch) push(patch, c, 'changed', ch);
    }
  }
  return patch;
}

/** Records the pre-change state of every item a sequence of ops touches. */
export class ChangeTracker {
  private readonly before = new Map<string, { c: Collection; id: string; item?: AnyItem }>();

  /** Call before applying `op`. Store items are immutable (replaced on change), so no copy is needed. */
  note(store: ModelStore, op: Op): void {
    const id = op.type === 'update' ? op.id : op.item.id;
    const key = `${op.c}\u0000${id}`;
    if (!this.before.has(key)) {
      this.before.set(key, { c: op.c, id, item: store.map(op.c).get(id) as AnyItem | undefined });
    }
  }

  get empty(): boolean {
    return this.before.size === 0;
  }

  /** Forward (before → now) and inverse (now → before) patches. */
  patches(store: ModelStore): { forward: ModelPatch; inverse: ModelPatch } {
    const rows = [...this.before.values()].map((b) => ({
      c: b.c,
      id: b.id,
      before: b.item,
      after: store.map(b.c).get(b.id) as AnyItem | undefined,
    }));
    return {
      forward: patchBetween(rows),
      inverse: patchBetween(rows.map((r) => ({ ...r, before: r.after, after: r.before }))),
    };
  }
}

/** `null` in an ItemChange means "remove the key"; transactions remove keys set to undefined. */
const toUpdate = <T extends { id: string }>(ch: ItemChange<T>) => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ch)) if (k !== 'id') out[k] = v === null ? undefined : v;
  return out;
};

/**
 * Applies a ModelPatch inside a transaction. Removals run first (links, annotations, then nodes, so
 * cascades don't double-remove), then additions (nodes before the links that reference them), then
 * changes. Items already in the target state are skipped, so replaying a patch is harmless.
 * Patches carry content, not array positions: a re-added item goes to the end of its collection.
 */
export function applyPatchTx(tx: Transaction, store: ModelStore, patch: ModelPatch): void {
  for (const id of patch.links?.removed ?? []) if (store.links.has(id)) tx.removeLink(id);
  for (const id of patch.annotations?.removed ?? [])
    if (store.annotations.has(id)) tx.removeAnnotation(id);
  for (const id of patch.nodes?.removed ?? []) if (store.nodes.has(id)) tx.removeNode(id);

  for (const n of patch.nodes?.added ?? []) {
    if (store.nodes.has(n.id)) tx.updateNode(n.id, n);
    else tx.addNode(n);
  }
  for (const n of patch.nodes?.changed ?? [])
    tx.updateNode(n.id, toUpdate(n) as Partial<NodeModel>);
  for (const l of patch.links?.added ?? []) {
    if (store.links.has(l.id)) tx.updateLink(l.id, l);
    else tx.addLink(l);
  }
  for (const l of patch.links?.changed ?? [])
    tx.updateLink(l.id, toUpdate(l) as Partial<LinkModel>);
  for (const a of patch.annotations?.added ?? []) {
    if (store.annotations.has(a.id)) tx.updateAnnotation(a.id, a);
    else tx.addAnnotation(a);
  }
  for (const a of patch.annotations?.changed ?? [])
    tx.updateAnnotation(a.id, toUpdate(a) as Partial<AnnotationModel>);
}

/** Live values written through setNodeData, per node. They aren't part of the document. */
export interface LiveState {
  keys: Set<string>;
  status: boolean;
}

/**
 * The patch from `current` to `target`. For nodes with live state, the live data keys (and status)
 * keep their current values, so a host store that doesn't mirror live values can't wipe them.
 */
export function diffModels(
  current: DiagramModel,
  target: DiagramModel,
  live: ReadonlyMap<string, LiveState> = new Map(),
): ModelPatch {
  const patch: ModelPatch = {};
  const collection = <T extends { id: string }>(
    c: Collection,
    cur: T[],
    next: T[],
    adjust: (cur: T | undefined, next: T) => T = (_c, n) => n,
  ) => {
    const byId = new Map(cur.map((i) => [i.id, i]));
    const nextIds = new Set(next.map((i) => i.id));
    for (const i of cur) if (!nextIds.has(i.id)) push(patch, c, 'removed', i.id);
    for (const raw of next) {
      const before = byId.get(raw.id);
      const after = adjust(before, raw);
      if (!before) push(patch, c, 'added', clone(after));
      else {
        const ch = itemChange(before, after);
        if (ch) push(patch, c, 'changed', ch);
      }
    }
  };
  collection<NodeModel>('nodes', current.nodes, target.nodes, (cur, next) => {
    const l = cur && live.get(cur.id);
    if (!cur || !l) return next;
    const data: DataRecord = { ...next.data };
    for (const k of l.keys) {
      if (cur.data && k in cur.data) data[k] = cur.data[k];
    }
    const out: NodeModel = { ...next };
    if (Object.keys(data).length || next.data) out.data = data;
    if (l.status) {
      if (cur.status === undefined) delete out.status;
      else out.status = cur.status;
    }
    return out;
  });
  collection<LinkModel>('links', current.links, target.links);
  collection<AnnotationModel>('annotations', current.annotations ?? [], target.annotations ?? []);
  if (!same(current.meta, target.meta))
    patch.meta = target.meta === undefined ? null : clone(target.meta);
  return patch;
}

/** The model without live values (for dirty checks): live data keys and live status removed. */
export function documentOf(model: DiagramModel, live: ReadonlyMap<string, LiveState>): string {
  if (live.size === 0) return JSON.stringify(model);
  return JSON.stringify({
    ...model,
    nodes: model.nodes.map((n) => {
      const l = live.get(n.id);
      if (!l) return n;
      const out: NodeModel = { ...n };
      if (n.data) {
        const data = { ...n.data };
        for (const k of l.keys) delete data[k];
        out.data = data;
      }
      if (l.status) delete out.status;
      return out;
    }),
  });
}
