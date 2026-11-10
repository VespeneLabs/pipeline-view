import {
  MODEL_VERSION,
  type AnnotationModel,
  type DataRecord,
  type DiagramModel,
  type LinkModel,
  type NodeModel,
} from './types';
import { migrateModel } from './migrate';

export type Collection = 'nodes' | 'links' | 'annotations';

export interface ItemOf {
  nodes: NodeModel;
  links: LinkModel;
  annotations: AnnotationModel;
}

export type AnyItem = ItemOf[Collection];

/** Deep copy of plain JSON-like data. */
export const clone = <T>(v: T): T => structuredClone(v);

/** Returns a copy of `obj` with `patch` applied. Keys whose patched value is `undefined` are removed. */
export function applyPatch<T extends object>(obj: T, patch: Partial<T>): T {
  const out = { ...obj, ...patch } as Record<string, unknown>;
  for (const k of Object.keys(patch)) if (out[k] === undefined) delete out[k];
  return out as T;
}

/**
 * In-memory model. Item objects are treated as immutable: every change replaces the object,
 * so consumers can detect changes by reference. Map insertion order is the serialization order.
 */
export class ModelStore {
  readonly nodes = new Map<string, NodeModel>();
  readonly links = new Map<string, LinkModel>();
  readonly annotations = new Map<string, AnnotationModel>();
  meta: DataRecord | undefined;
  /** Remembers whether the loaded model had an `annotations` key, so toJSON round-trips exactly. */
  private emitAnnotations = false;

  map<C extends Collection>(c: C): Map<string, ItemOf[C]> {
    return this[c] as Map<string, ItemOf[C]>;
  }

  load(model: DiagramModel): void {
    validateModel(model);
    const m = migrateModel(clone(model));
    this.nodes.clear();
    this.links.clear();
    this.annotations.clear();
    for (const n of m.nodes) this.nodes.set(n.id, n);
    for (const l of m.links) this.links.set(l.id, l);
    for (const a of m.annotations ?? []) this.annotations.set(a.id, a);
    this.meta = m.meta;
    this.emitAnnotations = m.annotations !== undefined;
  }

  toJSON(): DiagramModel {
    const out: DiagramModel = {
      version: MODEL_VERSION,
      nodes: [...this.nodes.values()],
      links: [...this.links.values()],
    };
    if (this.emitAnnotations || this.annotations.size > 0) {
      out.annotations = [...this.annotations.values()];
    }
    if (this.meta !== undefined) out.meta = this.meta;
    return clone(out);
  }

  indexOf(c: Collection, id: string): number {
    let i = 0;
    for (const k of this.map(c).keys()) {
      if (k === id) return i;
      i++;
    }
    return -1;
  }

  /** Inserts `item` at `index`, or at the end when `index` is out of range. Used to restore order on undo. */
  insertAt<C extends Collection>(c: C, item: ItemOf[C], index: number): void {
    const m = this.map(c);
    if (index < 0 || index >= m.size) {
      m.set(item.id, item);
      return;
    }
    const entries = [...m];
    entries.splice(index, 0, [item.id, item]);
    m.clear();
    for (const [k, v] of entries) m.set(k, v);
  }

  /** Links attached to a node. */
  linksOf(nodeId: string): LinkModel[] {
    const out: LinkModel[] = [];
    for (const l of this.links.values()) {
      if (l.from.node === nodeId || l.to.node === nodeId) out.push(l);
    }
    return out;
  }

  /** Annotations anchored to a node. */
  annotationsOf(nodeId: string): AnnotationModel[] {
    const out: AnnotationModel[] = [];
    for (const a of this.annotations.values()) if (a.anchor?.node === nodeId) out.push(a);
    return out;
  }
}

/** Structural validation of a model. Throws a descriptive Error on the first problem. */
export function validateModel(model: DiagramModel): void {
  if (!model || typeof model !== 'object') throw new Error('Model must be an object');
  if (!(Number.isInteger(model.version) && model.version >= 1 && model.version <= MODEL_VERSION)) {
    throw new Error(
      `Unsupported model version ${String(model.version)} (this build reads 1..${MODEL_VERSION})`,
    );
  }
  if (!Array.isArray(model.nodes) || !Array.isArray(model.links)) {
    throw new Error('Model must have `nodes` and `links` arrays');
  }
  const nodeIds = uniqueIds('node', model.nodes);
  uniqueIds('link', model.links);
  uniqueIds('annotation', model.annotations ?? []);
  for (const l of model.links) checkLinkEnds(l, (id) => nodeIds.has(id));
  for (const a of model.annotations ?? []) checkAnchor(a, (id) => nodeIds.has(id));
}

export function checkLinkEnds(l: LinkModel, hasNode: (id: string) => boolean): void {
  for (const end of [l.from, l.to]) {
    if (!end || !hasNode(end.node)) {
      throw new Error(`Link "${l.id}" references unknown node "${String(end?.node)}"`);
    }
  }
}

export function checkAnchor(a: AnnotationModel, hasNode: (id: string) => boolean): void {
  if (a.anchor && !hasNode(a.anchor.node)) {
    throw new Error(`Annotation "${a.id}" is anchored to unknown node "${a.anchor.node}"`);
  }
}

function uniqueIds(what: string, items: { id: string }[]): Set<string> {
  const ids = new Set<string>();
  for (const it of items) {
    if (typeof it?.id !== 'string' || it.id === '')
      throw new Error(`Every ${what} needs a string id`);
    if (ids.has(it.id)) throw new Error(`Duplicate ${what} id "${it.id}"`);
    ids.add(it.id);
  }
  return ids;
}
