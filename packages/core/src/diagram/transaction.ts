import type { AnnotationModel, LinkModel, NodeModel } from '../model/types';
import {
  applyPatch,
  checkAnchor,
  checkLinkEnds,
  clone,
  type AnyItem,
  type Collection,
  type ModelStore,
} from '../model/store';
import type { ModelDiff, Transaction } from './types';

/**
 * One primitive model change. Updates store only the patched keys (before and after),
 * so undoing a move doesn't clobber live data written later through setNodeData.
 */
export type Op =
  | { type: 'add'; c: Collection; item: AnyItem; index: number }
  | { type: 'remove'; c: Collection; item: AnyItem; index: number }
  | { type: 'update'; c: Collection; id: string; prev: Partial<AnyItem>; next: Partial<AnyItem> };

export function applyOp(store: ModelStore, op: Op): void {
  const m = store.map(op.c) as Map<string, AnyItem>;
  if (op.type === 'add') store.insertAt(op.c, op.item, op.index);
  else if (op.type === 'remove') m.delete(op.item.id);
  else {
    const cur = m.get(op.id);
    if (cur) m.set(op.id, applyPatch(cur, op.next));
  }
}

export function invertOp(op: Op): Op {
  switch (op.type) {
    case 'add':
      return { ...op, type: 'remove' };
    case 'remove':
      return { ...op, type: 'add' };
    case 'update':
      return { ...op, prev: op.next, next: op.prev };
  }
}

const opId = (op: Op) => (op.type === 'update' ? op.id : op.item.id);

/** Net effect of a sequence of ops. An item added and removed in the same batch doesn't appear at all. */
export function diffOf(ops: readonly Op[]): ModelDiff {
  const diff: ModelDiff = {
    added: { nodes: [], links: [], annotations: [] },
    removed: { nodes: [], links: [], annotations: [] },
    changed: { nodes: [], links: [], annotations: [] },
  };
  const seen = new Map<string, { c: Collection; id: string; before: boolean; after: boolean }>();
  for (const op of ops) {
    const id = opId(op);
    const key = `${op.c}\u0000${id}`;
    let s = seen.get(key);
    if (!s) seen.set(key, (s = { c: op.c, id, before: op.type !== 'add', after: true }));
    s.after = op.type !== 'remove';
  }
  for (const s of seen.values()) {
    if (!s.before && s.after) diff.added[s.c].push(s.id);
    else if (s.before && !s.after) diff.removed[s.c].push(s.id);
    else if (s.before && s.after) diff.changed[s.c].push(s.id);
  }
  return diff;
}

export const isEmptyDiff = (d: ModelDiff): boolean =>
  [d.added, d.removed, d.changed].every(
    (g) => g.nodes.length + g.links.length + g.annotations.length === 0,
  );

/** Applies changes to the store immediately and records them as ops. */
export class TransactionImpl implements Transaction {
  readonly ops: Op[] = [];

  /**
   * @param portIds Port ids of a node as currently resolved (per-node ports, FR-40), or undefined when
   *   they can't be resolved (unknown symbol). When given, an updateNode that removes ports also removes
   *   the links on those ports, in the same transaction.
   */
  constructor(
    private readonly store: ModelStore,
    private readonly portIds?: (node: NodeModel) => ReadonlySet<string> | undefined,
  ) {}

  private run(op: Op): void {
    applyOp(this.store, op);
    this.ops.push(op);
  }

  private add(c: Collection, item: AnyItem): void {
    if (typeof item?.id !== 'string' || item.id === '')
      throw new Error(`Cannot add item without an id to ${c}`);
    if (this.store.map(c).has(item.id)) throw new Error(`Duplicate id "${item.id}" in ${c}`);
    this.run({ type: 'add', c, item: clone(item), index: this.store.map(c).size });
  }

  private patch(c: Collection, id: string, patch: object): void {
    const cur = this.store.map(c).get(id) as unknown as Record<string, unknown> | undefined;
    if (!cur) throw new Error(`Cannot update unknown ${c} id "${id}"`);
    const next = clone(patch) as Record<string, unknown>;
    delete next.id;
    const prev: Record<string, unknown> = {};
    for (const k of Object.keys(next)) prev[k] = clone(cur[k]);
    this.run({
      type: 'update',
      c,
      id,
      prev: prev as Partial<AnyItem>,
      next: next as Partial<AnyItem>,
    });
  }

  private remove(c: Collection, id: string): void {
    const item = this.store.map(c).get(id) as AnyItem | undefined;
    if (!item) throw new Error(`Cannot remove unknown ${c} id "${id}"`);
    this.run({ type: 'remove', c, item, index: this.store.indexOf(c, id) });
  }

  private hasNode = (id: string) => this.store.nodes.has(id);

  addNode(node: NodeModel): void {
    this.add('nodes', node);
  }
  /** `data` in a patch replaces the whole record, and undo restores the previous record, including live values written in between. Use setNodeData for live values. */
  updateNode(id: string, patch: Partial<Omit<NodeModel, 'id'>>): void {
    // Per-node ports derive from type, data or the ports override (FR-40).
    const portsMayChange =
      this.portIds !== undefined && ('data' in patch || 'ports' in patch || 'type' in patch);
    const before = portsMayChange ? this.portIdsOf(id) : undefined;
    this.patch('nodes', id, patch);
    if (before) this.removeLinksOnLostPorts(id, before);
  }

  private portIdsOf(id: string): ReadonlySet<string> | undefined {
    const node = this.store.nodes.get(id);
    return node && this.portIds!(node);
  }

  /**
   * Removes the links attached to ports that existed before an update and are gone after it, so they're
   * part of the same undo step and of the modelChange diff. Links that already pointed at an unknown
   * port are left alone.
   */
  private removeLinksOnLostPorts(id: string, before: ReadonlySet<string>): void {
    const after = this.portIdsOf(id);
    if (!after) return;
    const lost = (port: string) => before.has(port) && !after.has(port);
    for (const l of this.store.linksOf(id)) {
      if ((l.from.node === id && lost(l.from.port)) || (l.to.node === id && lost(l.to.port))) {
        this.remove('links', l.id);
      }
    }
  }
  /** Also removes the node's links and the annotations anchored to it. */
  removeNode(id: string): void {
    if (!this.store.nodes.has(id)) throw new Error(`Cannot remove unknown nodes id "${id}"`);
    for (const l of this.store.linksOf(id)) this.remove('links', l.id);
    for (const a of this.store.annotationsOf(id)) this.remove('annotations', a.id);
    this.remove('nodes', id);
  }

  addLink(link: LinkModel): void {
    checkLinkEnds(link, this.hasNode);
    this.add('links', link);
  }
  updateLink(id: string, patch: Partial<Omit<LinkModel, 'id'>>): void {
    const cur = this.store.links.get(id);
    if (cur) checkLinkEnds({ ...cur, ...patch } as LinkModel, this.hasNode);
    this.patch('links', id, patch);
  }
  removeLink(id: string): void {
    this.remove('links', id);
  }

  addAnnotation(a: AnnotationModel): void {
    checkAnchor(a, this.hasNode);
    this.add('annotations', a);
  }
  updateAnnotation(id: string, patch: Partial<AnnotationModel>): void {
    const cur = this.store.annotations.get(id);
    if (cur) checkAnchor({ ...cur, ...patch } as AnnotationModel, this.hasNode);
    this.patch('annotations', id, patch);
  }
  removeAnnotation(id: string): void {
    this.remove('annotations', id);
  }
}
