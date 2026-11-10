import type { DataRecord, DiagramModel } from '../model/types';
import { ModelStore, applyPatch } from '../model/store';
import { SymbolRegistry, globalSymbols } from '../symbols/registry';
import { Emitter } from './emitter';
import { TransactionImpl, applyOp, diffOf, invertOp, isEmptyDiff, type Op } from './transaction';
import type {
  DiagramApi,
  DiagramEvents,
  DiagramMode,
  DiagramOptions,
  ItemRef,
  ModelDiff,
  ThemeName,
  Transaction,
} from './types';

/** Events the renderer and other internal layers listen to. Not part of the public API. */
export interface InternalEvents {
  /** Live data changed on these nodes (setNodeData fast path). */
  data: { ids: string[] };
  /** Structural change from a transaction, undo or redo. */
  model: { diff: ModelDiff };
  /** The whole model was replaced. */
  load: Record<string, never>;
  mode: { mode: DiagramMode };
  theme: { theme: ThemeName };
}

const MAX_UNDO = 200;

/** The model / command / event part of DiagramApi. The viewport, rendering and export are added in later layers. */
type HeadlessApi = Pick<
  DiagramApi,
  | 'load'
  | 'toJSON'
  | 'update'
  | 'setNodeData'
  | 'setNodeDataBatch'
  | 'undo'
  | 'redo'
  | 'canUndo'
  | 'canRedo'
  | 'getMode'
  | 'setMode'
  | 'setTheme'
  | 'getSelection'
  | 'setSelection'
  | 'on'
  | 'destroy'
>;

const refKey = (r: ItemRef) => `${r.kind}\u0000${r.id}`;

export class Diagram implements HeadlessApi {
  /** @internal Model storage. Treat items as read-only. */
  readonly store = new ModelStore();
  /** Instance registry layered over the global one (FR-7). */
  readonly symbols: SymbolRegistry;
  /** @internal */
  readonly internal = new Emitter<InternalEvents>();

  private readonly events = new Emitter<DiagramEvents>();
  private undoStack: Op[][] = [];
  private redoStack: Op[][] = [];
  private selection: ItemRef[] = [];
  private mode: DiagramMode;
  private theme: ThemeName;
  private inTransaction = false;
  private previewOps: Op[] | null = null;
  private destroyed = false;

  constructor(readonly options: DiagramOptions = {}) {
    this.symbols = new SymbolRegistry(globalSymbols);
    if (options.symbols?.length) this.symbols.register(...options.symbols);
    this.mode = options.mode ?? 'view';
    this.theme = options.theme ?? 'auto';
  }

  // ---- model ---------------------------------------------------------------

  /** Replaces the model. Clears undo history and selection. Doesn't emit modelChange, since the host initiated it. */
  load(model: DiagramModel): void {
    this.assertAlive();
    this.store.load(model);
    this.previewOps = null;
    this.undoStack = [];
    this.redoStack = [];
    this.internal.emit('load', {});
    this.setSelection([]);
  }

  toJSON(): DiagramModel {
    return this.store.toJSON();
  }

  update(fn: (tx: Transaction) => void, opts: { undoable?: boolean } = {}): void {
    if (this.previewOps) throw new Error('Commit or cancel the active preview before update()');
    const ops = this.runTx(fn);
    if (ops.length === 0) return;
    if (opts.undoable !== false) this.pushUndo(ops);
    this.commit(ops);
  }

  /**
   * Transient change for interactive gestures (drag, rotate preview). It's applied and rendered
   * immediately but doesn't create an undo step or emit modelChange. Calls accumulate until
   * commitPreview() (one undo step, one modelChange) or cancelPreview() (everything reverted).
   */
  preview(fn: (tx: Transaction) => void): void {
    const ops = this.runTx(fn);
    this.previewOps ??= [];
    this.previewOps.push(...ops);
    if (ops.length) this.commit(ops, false);
  }

  commitPreview(): void {
    const ops = this.previewOps;
    this.previewOps = null;
    if (!ops?.length) return;
    this.pushUndo(ops);
    this.commit(ops, true, false);
  }

  cancelPreview(): void {
    const ops = this.previewOps;
    this.previewOps = null;
    if (!ops?.length) return;
    const inverse = ops.map(invertOp).reverse();
    for (const op of inverse) applyOp(this.store, op);
    this.commit(inverse, false);
  }

  isPreviewing(): boolean {
    return this.previewOps !== null;
  }

  private runTx(fn: (tx: Transaction) => void): Op[] {
    this.assertAlive();
    if (this.inTransaction) throw new Error('diagram.update() cannot be nested');
    const tx = new TransactionImpl(this.store);
    this.inTransaction = true;
    try {
      fn(tx);
    } catch (err) {
      for (let i = tx.ops.length - 1; i >= 0; i--) applyOp(this.store, invertOp(tx.ops[i]!));
      throw err;
    } finally {
      this.inTransaction = false;
    }
    return tx.ops;
  }

  private pushUndo(ops: Op[]): void {
    this.undoStack.push(ops);
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack = [];
  }

  undo(): void {
    if (this.previewOps) this.cancelPreview();
    const ops = this.undoStack.pop();
    if (!ops) return;
    const inverse = ops.map(invertOp).reverse();
    for (const op of inverse) applyOp(this.store, op);
    this.redoStack.push(ops);
    this.commit(inverse);
  }

  redo(): void {
    if (this.previewOps) this.cancelPreview();
    const ops = this.redoStack.pop();
    if (!ops) return;
    for (const op of ops) applyOp(this.store, op);
    this.undoStack.push(ops);
    this.commit(ops);
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Emits the net diff: `internal` for layers (render / re-route), `pub` for modelChange. */
  private commit(ops: Op[], pub = true, internal = true): void {
    const diff = diffOf(ops);
    if (isEmptyDiff(diff)) return;
    this.pruneSelection(diff);
    if (internal) this.internal.emit('model', { diff });
    if (pub && this.events.has('modelChange')) {
      // Snapshot eagerly, and only when someone listens, so async readers see the state at commit time.
      this.events.emit('modelChange', { diff, model: this.store.toJSON() });
    }
  }

  // ---- live data fast path (FR-4) -------------------------------------------

  setNodeData(id: string, patch: DataRecord, status?: string): void {
    if (this.writeData(id, patch, status)) this.internal.emit('data', { ids: [id] });
  }

  setNodeDataBatch(updates: Record<string, { data?: DataRecord; status?: string }>): void {
    const ids: string[] = [];
    for (const id in updates) {
      const u = updates[id]!;
      if (this.writeData(id, u.data, u.status)) ids.push(id);
    }
    if (ids.length) this.internal.emit('data', { ids });
  }

  /**
   * Unknown ids are ignored, because live feeds often carry tags that aren't on the diagram.
   * Pass status '' to clear it. A call with neither patch nor status is a no-op.
   */
  private writeData(
    id: string,
    patch: DataRecord | undefined,
    status: string | undefined,
  ): boolean {
    this.assertAlive();
    const node = this.store.nodes.get(id);
    if (!node || (!patch && status === undefined)) return false;
    const next: Partial<typeof node> = {};
    if (patch) next.data = { ...node.data, ...patch };
    if (status !== undefined) next.status = status;
    this.store.nodes.set(id, applyPatch(node, next));
    return true;
  }

  // ---- mode / theme --------------------------------------------------------

  getMode(): DiagramMode {
    return this.mode;
  }

  setMode(mode: DiagramMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.internal.emit('mode', { mode });
  }

  getTheme(): ThemeName {
    return this.theme;
  }

  setTheme(theme: ThemeName): void {
    if (theme === this.theme) return;
    this.theme = theme;
    this.internal.emit('theme', { theme });
  }

  // ---- selection -----------------------------------------------------------

  getSelection(): ItemRef[] {
    return this.selection.map((r) => ({ ...r }));
  }

  /** Unknown and duplicate items are dropped. Emits selectionChange only if the selection actually changed. */
  setSelection(items: ItemRef[]): void {
    const seen = new Set<string>();
    const next: ItemRef[] = [];
    for (const r of items) {
      const k = refKey(r);
      if (seen.has(k) || !this.exists(r)) continue;
      seen.add(k);
      next.push({ kind: r.kind, id: r.id } as ItemRef);
    }
    const same =
      next.length === this.selection.length &&
      next.every((r, i) => refKey(r) === refKey(this.selection[i]!));
    if (same) return;
    this.selection = next;
    this.events.emit('selectionChange', { selection: this.getSelection() });
  }

  private exists(r: ItemRef): boolean {
    const c = r.kind === 'node' ? 'nodes' : r.kind === 'link' ? 'links' : 'annotations';
    return this.store.map(c).has(r.id);
  }

  private pruneSelection(diff: ModelDiff): void {
    const removed =
      diff.removed.nodes.length + diff.removed.links.length + diff.removed.annotations.length;
    if (removed > 0 && this.selection.length > 0) this.setSelection(this.selection);
  }

  // ---- events / lifecycle --------------------------------------------------

  on<K extends keyof DiagramEvents>(
    event: K,
    handler: (payload: DiagramEvents[K]) => void,
  ): () => void {
    return this.events.on(event, handler);
  }

  /** @internal Lets layers (viewport, renderer, input) emit public events. */
  emit<K extends keyof DiagramEvents>(event: K, payload: DiagramEvents[K]): void {
    this.events.emit(event, payload);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.events.clear();
    this.internal.clear();
    this.undoStack = [];
    this.redoStack = [];
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('Diagram has been destroyed');
  }
}
