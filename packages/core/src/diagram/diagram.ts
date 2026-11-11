import type {
  DataRecord,
  DiagramModel,
  ModelPatch,
  LinkEnd,
  LinkKind,
  NodeModel,
  Point,
  Rect,
  Size,
} from '../model/types';
import { ModelStore, applyPatch, clone, validateModel } from '../model/store';
import { migrateModel } from '../model/migrate';
import {
  ChangeTracker,
  applyPatchTx,
  diffModels,
  documentOf,
  isEmptyPatch,
  type LiveState,
} from './changes';
import { SymbolRegistry, globalSymbols } from '../symbols/registry';
import { ViewRegistry } from '../symbols/view-registry';
import { ViewportController } from '../viewport/controller';
import {
  DEFAULT_MAX_ZOOM,
  DEFAULT_MIN_ZOOM,
  clamp,
  diagramToScreen,
  fitRect,
  lerpViewport,
  screenToDiagram,
} from '../viewport/math';
import { applyViewportToView, createView, type View } from '../viewport/view';
import { Emitter } from './emitter';
import { nodeBounds, unionRects } from './geometry';
import { nodePorts } from '../symbols/resolve';
import { connectLink } from './validate';
import { SvgRenderer } from '../render/svg-renderer';
import { OverlayRenderer } from '../render/overlay';
import { attachPointerEvents } from '../render/input';
import { KeyboardNavigation } from '../render/a11y';
import { CullingController } from '../render/culling';
import { DiffLayer } from '../render/diff';
import type { GetDiffOptions } from '../model/compare';
import { IssueLayer } from '../render/issues';
import { exportPng, exportSvgString } from '../render/export';
import { TransactionImpl, applyOp, diffOf, invertOp, isEmptyDiff, type Op } from './transaction';
import type {
  ConnectResult,
  DiagramApi,
  DiagramEvents,
  DiagramMode,
  DiagramOptions,
  IssueMap,
  DropSource,
  ItemRef,
  ModelDiff,
  ThemeName,
  Transaction,
  Viewport,
  ChangeOrigin,
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
  /** The DOM view was created (mount). Renderer layers attach here. */
  mount: { view: View };
  viewport: { viewport: Viewport };
  /** Node geometry changed outside the model (measured HTML node sizes): re-place and re-route. */
  geometry: { ids: string[] };
  /** startPlacement() was called (FR-50); the editor controller shows the preview. */
  placement: { type: string; init: Partial<NodeModel> };
}

const MAX_UNDO = 200;
const ANIMATION_MS = 250;

const refKey = (r: ItemRef) => `${r.kind}\u0000${r.id}`;

export class Diagram implements DiagramApi {
  /** @internal Model storage. Treat items as read-only. */
  readonly store = new ModelStore();
  /** Instance registry layered over the global one (FR-7). */
  readonly symbols: SymbolRegistry;
  /** Measured sizes of content-sized HTML nodes (FR-45). View state: never saved, never undone. */
  private readonly measuredSizes = new Map<string, Size>();
  private htmlTypesCache:
    | { spec: DiagramOptions['nodeRenderers']; types: Record<string, 'fixed' | 'content'> }
    | undefined;
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
  private previewTracker: ChangeTracker | null = null;
  /** Live-data keys per node (setNodeData), excluded from patch() and isDirty(). */
  private readonly live = new Map<string, LiveState>();
  private revision = 0;
  /**
   * Bumped by every applied change (commits, previews, loads). An async veto replays its ops only if
   * this is unchanged when the hook resolves (see replayIfUnchanged).
   */
  private epoch = 0;
  private savedRevision = 0;
  private savedDocument = '';
  private destroyed = false;

  /** DOM view. Undefined until mount(). */
  view: View | undefined;
  /** @internal Pan/zoom input. Its `suppressClick` tells click handlers a drag just ended. */
  viewportController: ViewportController | undefined;
  /** @internal SVG renderer. Created on mount. */
  renderer: SvgRenderer | undefined;
  /** @internal Annotations and HTML overlays. Created on mount. */
  overlay: OverlayRenderer | undefined;
  private detachPointerEvents: (() => void) | undefined;
  /** @internal Culling and level of detail for large diagrams (FR-55). Created on mount. */
  culling: CullingController | undefined;
  /** @internal Keyboard focus navigation. Created on mount. */
  keyboard: KeyboardNavigation | undefined;
  /** @internal Comparison marks (FR-51). Created on mount. */
  diffLayer: DiffLayer | undefined;
  private diffBase: { base: DiagramModel; opts: GetDiffOptions } | null = null;
  /** @internal Problem markers (FR-48). Created on mount. */
  issueLayer: IssueLayer | undefined;
  private issues: IssueMap = {};
  private viewport: Viewport = { x: 0, y: 0, zoom: 1 };
  private size: Size = { width: 0, height: 0 };
  private readonly minZoom: number;
  private readonly maxZoom: number;
  private resizeObserver: ResizeObserver | undefined;
  private animFrame = 0;
  private pendingFit: { padding?: number } | null = null;
  /** A fit-on-load is wanted once the content (HTML/React included) has rendered and been measured. */
  private fitWanted = false;
  private fitFrame = 0;
  /** A non-final viewport change happened since the last `final: true` event. */
  private unsettled = false;
  private viewportLocked = false;

  constructor(readonly options: DiagramOptions = {}) {
    this.symbols = new ViewRegistry(globalSymbols, () => this.htmlNodeTypes(), this.measuredSizes);
    if (options.symbols?.length) this.symbols.register(...options.symbols);
    this.mode = options.mode ?? 'view';
    this.theme = options.theme ?? 'auto';
    this.minZoom = options.minZoom ?? DEFAULT_MIN_ZOOM;
    if (options.initialViewport) this.viewport = { ...options.initialViewport };
    this.maxZoom = options.maxZoom ?? DEFAULT_MAX_ZOOM;
  }

  // ---- DOM -----------------------------------------------------------------

  /** Creates the DOM inside `container` and starts pan/zoom input. Call on the client only. */
  mount(container: HTMLElement): void {
    this.assertAlive();
    if (this.view) throw new Error('Diagram is already mounted');
    const grid = this.options.grid;
    const view = createView(
      container,
      this.options.ariaLabel,
      grid?.visible ? grid.size : undefined,
    );
    this.view = view;
    view.root.dataset.mode = this.mode;
    this.applyTheme();
    this.measure();
    applyViewportToView(view, this.viewport);
    this.viewportController = new ViewportController({
      root: view.root,
      getViewport: () => this.getViewport(),
      applyViewport: (v) => this.applyViewport(v),
      settle: () => this.applyViewport(this.viewport, true),
      isLocked: () => this.viewportLocked,
      getMode: () => this.mode,
      minZoom: this.minZoom,
      maxZoom: this.maxZoom,
    });
    const RO = container.ownerDocument.defaultView?.ResizeObserver;
    if (RO) {
      this.resizeObserver = new RO(() => this.measure());
      this.resizeObserver.observe(view.root);
    }
    this.renderer = new SvgRenderer(this, view);
    this.overlay = new OverlayRenderer(this, view);
    this.detachPointerEvents = attachPointerEvents(this, view);
    this.keyboard = new KeyboardNavigation(this, view);
    this.culling = new CullingController(this, view);
    this.diffLayer = new DiffLayer(this, view);
    if (this.diffBase) this.diffLayer.set(this.diffBase.base, this.diffBase.opts);
    this.issueLayer = new IssueLayer(this, view);
    this.issueLayer.set(this.issues);
    this.internal.emit('mount', { view });
    if (this.pendingFit) this.zoomToFit(this.pendingFit);
    if (this.fitWanted) this.scheduleFit();
  }

  /**
   * Fit-on-load (FR-47): waits two frames so HTML and React content has rendered and been measured,
   * then fits. Any viewport change before that (user or host) cancels it.
   */
  private scheduleFit(): void {
    this.fitWanted = true;
    const win = this.view?.root.ownerDocument.defaultView;
    if (!this.view || !win?.requestAnimationFrame) return; // mount() schedules it
    if (this.fitFrame) win.cancelAnimationFrame(this.fitFrame);
    this.fitFrame = win.requestAnimationFrame(() => {
      this.fitFrame = win.requestAnimationFrame(() => {
        this.fitFrame = 0;
        if (!this.fitWanted || this.destroyed) return;
        this.renderer?.flush();
        this.overlay?.flush();
        this.fitWanted = false;
        this.zoomToFit();
      });
    });
  }

  /** Stops user pan and zoom (programmatic changes still apply), for example a locked dashboard (FR-47). */
  lockViewport(locked: boolean): void {
    this.viewportLocked = locked;
    this.view?.root.toggleAttribute('data-viewport-locked', locked);
  }

  isViewportLocked(): boolean {
    return this.viewportLocked;
  }

  private measure(): void {
    const r = this.view?.root;
    if (!r) return;
    this.size = { width: r.clientWidth, height: r.clientHeight };
    if (this.pendingFit && this.size.width > 0) this.zoomToFit(this.pendingFit);
  }

  private applyTheme(): void {
    const root = this.view?.root;
    if (!root) return;
    if (this.theme === 'auto') delete root.dataset.theme;
    else root.dataset.theme = this.theme;
  }

  // ---- model ---------------------------------------------------------------

  /**
   * Replaces the model. Clears undo history, selection, live-data tracking and the dirty baseline.
   * Doesn't emit modelChange, since the host initiated it. To sync a host store without a reload, use patch().
   */
  load(model: DiagramModel): void {
    this.assertAlive();
    this.store.load(model);
    this.epoch++;
    this.previewOps = null;
    this.previewTracker = null;
    this.undoStack = [];
    this.redoStack = [];
    this.live.clear();
    this.internal.emit('load', {});
    this.setSelection([]);
    this.markSaved();
    const policy = this.options.fitOnLoad ?? 'if-no-viewport';
    if (policy === 'always' || (policy === 'if-no-viewport' && !this.options.initialViewport)) {
      this.scheduleFit();
    }
  }

  toJSON(): DiagramModel {
    return this.store.toJSON();
  }

  /**
   * One transaction: one render pass, one undo step, one modelChange (FR-3). `onBeforeDelete` and
   * `beforeChange` can veto it (FR-43); when a hook returns a Promise, the change is rolled back at once
   * and re-applied only if the Promise resolves true.
   */
  update(fn: (tx: Transaction) => void, opts: { undoable?: boolean } = {}): void {
    this.transact(fn, opts, true);
  }

  /**
   * `guarded` is true for user edits: the before-hooks run (FR-43) and links on ports that disappear
   * are pruned (FR-40). It's false for host-driven patches (applyDiff, patch(), host history), whose
   * documents are the source of truth and already carry any link removals.
   */
  private transact(
    fn: (tx: Transaction) => void,
    opts: { undoable?: boolean },
    guarded: boolean,
    origin: ChangeOrigin = guarded ? 'user' : 'host',
  ): void {
    if (this.previewOps) throw new Error('Commit or cancel the active preview before update()');
    const tracker = new ChangeTracker();
    const ops = this.runTx(fn, tracker, guarded);
    if (ops.length === 0) return;
    const apply = (t: ChangeTracker) => {
      if (opts.undoable !== false) this.pushUndo(ops, t);
      this.commit(ops, true, true, t, origin);
    };
    const verdict = guarded ? this.askHooks(ops, tracker) : true;
    if (verdict === true) return apply(tracker);
    // Vetoed (or pending): nothing was emitted yet, so a silent revert is enough.
    this.revertSilently(ops);
    if (verdict !== false) {
      const at = this.epoch;
      void verdict.then((ok) => {
        if (ok) this.replayIfUnchanged(at, ops, () => apply(this.applyTracked(ops)));
      });
    }
  }

  /**
   * Runs onBeforeDelete (when the change removes items, cascaded links included) and then beforeChange.
   * Returns a boolean when every hook answered synchronously.
   */
  private askHooks(ops: Op[], tracker: ChangeTracker): boolean | Promise<boolean> {
    const { onBeforeDelete, beforeChange } = this.options;
    if (!onBeforeDelete && !beforeChange) return true;
    const diff = diffOf(ops);
    if (isEmptyDiff(diff)) return true;
    const r = diff.removed;
    const removes = r.nodes.length + r.links.length + r.annotations.length > 0;
    const first = removes && onBeforeDelete ? onBeforeDelete({ ...r }) : true;
    const second = () =>
      beforeChange ? beforeChange(diff, tracker.patches(this.store).forward) : true;
    const settle = (v: unknown) => v === true;
    if (first instanceof Promise) {
      return first.then(
        async (ok) => settle(ok) && settle(await second()),
        () => false,
      );
    }
    if (!settle(first)) return false;
    const v = second();
    return v instanceof Promise ? v.then(settle, () => false) : settle(v);
  }

  /**
   * Re-applies a change whose async veto resolved true, but only if nothing changed meanwhile. The ops
   * were recorded against the earlier model: replaying them over newer edits could overwrite those edits
   * or reinsert items at stale positions. When the model moved (an edit, undo, load, or a gesture in
   * progress), the change is dropped and the public `changeDropped` event tells the host.
   */
  private replayIfUnchanged(at: number, ops: Op[], replay: () => void): void {
    if (this.destroyed) return;
    if (this.epoch !== at || this.previewOps) {
      this.events.emit('changeDropped', { reason: 'stale', diff: diffOf(ops) });
      return;
    }
    replay();
  }

  private revertSilently(ops: Op[]): void {
    for (let i = ops.length - 1; i >= 0; i--) applyOp(this.store, invertOp(ops[i]!));
  }

  // ---- controlled mode (FR-44) -----------------------------------------------

  /**
   * Applies a patch as one transaction. Only the touched items change: untouched links aren't
   * re-routed, the viewport stays, and selection and live data survive. `meta` is replaced outside
   * the transaction (not undoable). Undoable by default.
   */
  applyDiff(patch: ModelPatch, opts: { undoable?: boolean } = {}): void {
    if (patch.meta !== undefined)
      this.store.meta = patch.meta === null ? undefined : clone(patch.meta);
    // Host-driven, so the before-hooks don't run.
    this.transact((tx) => applyPatchTx(tx, this.store, patch), opts, false);
  }

  /**
   * Controlled mode: applies only the difference between the current model and `model` (for example a
   * host store's document after the host applied an onModelChange patch). Live values written through
   * setNodeData are kept. Not undoable by default (the host owns the history). Returns the applied patch.
   */
  patch(model: DiagramModel, opts: { undoable?: boolean } = {}): ModelPatch {
    validateModel(model);
    const diff = diffModels(this.store.toJSON(), migrateModel(model), this.live);
    if (!isEmptyPatch(diff)) this.applyDiff(diff, { undoable: opts.undoable ?? false });
    return diff;
  }

  /** True if the document changed since the last markSaved() or load(). Live values don't count. */
  isDirty(): boolean {
    if (this.revision === this.savedRevision) return false;
    return documentOf(this.store.toJSON(), this.live) !== this.savedDocument;
  }

  /** Sets the dirty baseline to the current document. */
  markSaved(): void {
    this.savedRevision = this.revision;
    this.savedDocument = documentOf(this.store.toJSON(), this.live);
  }

  /**
   * Transient change for interactive gestures (drag, rotate preview). It's applied and rendered
   * immediately but doesn't create an undo step or emit modelChange. Calls accumulate until
   * commitPreview() (one undo step, one modelChange) or cancelPreview() (everything reverted).
   */
  preview(fn: (tx: Transaction) => void): void {
    this.previewTracker ??= new ChangeTracker();
    const ops = this.runTx(fn, this.previewTracker, true);
    this.previewOps ??= [];
    this.previewOps.push(...ops);
    if (ops.length) this.commit(ops, false);
  }

  commitPreview(): void {
    const ops = this.previewOps;
    const tracker = this.previewTracker ?? new ChangeTracker();
    this.previewOps = null;
    this.previewTracker = null;
    if (!ops?.length) return;
    const verdict = this.askHooks(ops, tracker);
    if (verdict === true) {
      this.pushUndo(ops, tracker);
      this.commit(ops, true, false, tracker);
      return;
    }
    // The gesture was already rendered, so revert visibly.
    const inverse = ops.map(invertOp).reverse();
    for (const op of inverse) applyOp(this.store, op);
    this.commit(inverse, false);
    if (verdict !== false) {
      const at = this.epoch;
      void verdict.then((ok) => {
        if (!ok) return;
        this.replayIfUnchanged(at, ops, () => {
          const t = this.applyTracked(ops);
          this.pushUndo(ops, t);
          this.commit(ops, true, true, t);
        });
      });
    }
  }

  cancelPreview(): void {
    const ops = this.previewOps;
    this.previewOps = null;
    this.previewTracker = null;
    if (!ops?.length) return;
    const inverse = ops.map(invertOp).reverse();
    for (const op of inverse) applyOp(this.store, op);
    this.commit(inverse, false);
  }

  isPreviewing(): boolean {
    return this.previewOps !== null;
  }

  /** Resolved port ids of a node, or undefined for an unknown symbol without a ports override. */
  private portIdsOf(node: NodeModel): ReadonlySet<string> | undefined {
    const def = this.symbols.get(node.type);
    return def || node.ports ? new Set(nodePorts(def, node).map((p) => p.id)) : undefined;
  }

  private runTx(fn: (tx: Transaction) => void, tracker?: ChangeTracker, prune = true): Op[] {
    this.assertAlive();
    if (this.inTransaction) throw new Error('diagram.update() cannot be nested');
    const tx = new TransactionImpl(this.store, {
      tracker,
      // User edits prune links on ports that disappear (FR-40); host-driven patches don't (FR-44).
      ...(prune ? { portIds: (node: NodeModel) => this.portIdsOf(node) } : {}),
    });
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

  private pushUndo(ops: Op[], tracker?: ChangeTracker): void {
    const h = this.options.history;
    if (h === false) return;
    if (h) {
      if (tracker && !tracker.empty) h.push(tracker.patches(this.store));
      return;
    }
    this.undoStack.push(ops);
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack = [];
  }

  undo(): void {
    if (this.previewOps) this.cancelPreview();
    const h = this.options.history;
    if (h === false) return;
    if (h) {
      const entry = h.undo();
      if (entry) this.applyHistoryPatch(entry.inverse);
      return;
    }
    const ops = this.undoStack.pop();
    if (!ops) return;
    const inverse = ops.map(invertOp).reverse();
    const tracker = this.applyTracked(inverse);
    this.redoStack.push(ops);
    this.commit(inverse, true, true, tracker, 'history');
  }

  redo(): void {
    if (this.previewOps) this.cancelPreview();
    const h = this.options.history;
    if (h === false) return;
    if (h) {
      const entry = h.redo();
      if (entry) this.applyHistoryPatch(entry.forward);
      return;
    }
    const ops = this.redoStack.pop();
    if (!ops) return;
    const tracker = this.applyTracked(ops);
    this.undoStack.push(ops);
    this.commit(ops, true, true, tracker, 'history');
  }

  canUndo(): boolean {
    const h = this.options.history;
    if (h === false) return false;
    if (h) return h.canUndo?.() ?? true;
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    const h = this.options.history;
    if (h === false) return false;
    if (h) return h.canRedo?.() ?? true;
    return this.redoStack.length > 0;
  }

  private applyTracked(ops: Op[]): ChangeTracker {
    const tracker = new ChangeTracker();
    for (const op of ops) {
      tracker.note(this.store, op);
      applyOp(this.store, op);
    }
    return tracker;
  }

  /** Applies a host history entry without pushing a new one. */
  private applyHistoryPatch(patch: ModelPatch): void {
    if (patch.meta !== undefined)
      this.store.meta = patch.meta === null ? undefined : clone(patch.meta);
    this.transact(
      (tx) => applyPatchTx(tx, this.store, patch),
      { undoable: false },
      false,
      'history',
    );
  }

  /** Emits the net diff: `internal` for layers (render / re-route), `pub` for modelChange. */
  private commit(
    ops: Op[],
    pub = true,
    internal = true,
    tracker?: ChangeTracker,
    origin: ChangeOrigin = 'user',
  ): void {
    const diff = diffOf(ops);
    if (isEmptyDiff(diff)) return;
    this.epoch++;
    if (pub) this.revision++;
    this.pruneSelection(diff);
    if (internal) this.internal.emit('model', { diff });
    if (pub && this.events.has('modelChange')) {
      // Snapshot eagerly, and only when someone listens, so async readers see the state at commit time.
      const payload: DiagramEvents['modelChange'] = { diff, model: this.store.toJSON(), origin };
      if (tracker) payload.patch = tracker.patches(this.store).forward;
      this.events.emit('modelChange', payload);
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
    // Remember what's live, so patch() keeps it and isDirty() ignores it (FR-44).
    let l = this.live.get(id);
    if (!l) this.live.set(id, (l = { keys: new Set(), status: false }));
    if (patch) for (const k in patch) l.keys.add(k);
    if (status !== undefined) l.status = true;
    return true;
  }

  // ---- mode / theme --------------------------------------------------------

  getMode(): DiagramMode {
    return this.mode;
  }

  setMode(mode: DiagramMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    if (this.view) this.view.root.dataset.mode = mode;
    this.internal.emit('mode', { mode });
  }

  getTheme(): ThemeName {
    return this.theme;
  }

  setTheme(theme: ThemeName): void {
    if (theme === this.theme) return;
    this.theme = theme;
    this.applyTheme();
    this.internal.emit('theme', { theme });
  }

  /** Changes the diagram root's accessible name (`DiagramOptions.ariaLabel`) at any time. */
  setAriaLabel(label: string): void {
    this.options.ariaLabel = label;
    this.view?.root.setAttribute('aria-label', label);
  }

  // ---- viewport ------------------------------------------------------------

  getViewport(): Viewport {
    return { ...this.viewport };
  }

  setViewport(v: Partial<Viewport>, opts: { animate?: boolean } = {}): void {
    const target: Viewport = {
      x: v.x ?? this.viewport.x,
      y: v.y ?? this.viewport.y,
      zoom: clamp(v.zoom ?? this.viewport.zoom, this.minZoom, this.maxZoom),
    };
    this.cancelAnimation();
    const win = this.view?.root.ownerDocument.defaultView;
    if (!opts.animate || !win?.requestAnimationFrame || prefersReducedMotion(win)) {
      this.applyViewport(target, true);
      return;
    }
    const from = this.getViewport();
    const start = win.performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ANIMATION_MS);
      this.applyViewport(t >= 1 ? target : lerpViewport(from, target, t), t >= 1);
      this.animFrame = t >= 1 ? 0 : win.requestAnimationFrame(step);
    };
    this.animFrame = win.requestAnimationFrame(step);
  }

  /**
   * @internal Sets the viewport now, with no clamping or animation (used by input). `final` marks the
   * end of a gesture or animation (FR-47); a final call with an unchanged viewport still emits once to
   * settle a gesture.
   */
  applyViewport(v: Viewport, final = false): void {
    const changed =
      v.x !== this.viewport.x || v.y !== this.viewport.y || v.zoom !== this.viewport.zoom;
    if (!changed && !(final && this.unsettled)) return;
    this.fitWanted = false; // someone positioned the view: don't jump to a fit later
    if (changed) {
      this.viewport = { ...v };
      if (this.view) applyViewportToView(this.view, v);
      this.internal.emit('viewport', { viewport: this.getViewport() });
    }
    this.unsettled = !final;
    this.events.emit('viewportChange', { viewport: this.getViewport(), final });
  }

  private cancelAnimation(): void {
    if (this.animFrame)
      this.view?.root.ownerDocument.defaultView?.cancelAnimationFrame(this.animFrame);
    this.animFrame = 0;
  }

  /** Fits the whole diagram. Before mount, or while the container has no size, it's deferred until it can run. */
  zoomToFit(opts: { padding?: number; animate?: boolean } = {}): void {
    if (!this.view || this.size.width === 0 || this.size.height === 0) {
      this.pendingFit = { padding: opts.padding };
      return;
    }
    this.pendingFit = null;
    const bounds = this.getBounds();
    if (bounds.width === 0 && bounds.height === 0 && this.store.nodes.size === 0) return;
    this.setViewport(
      fitRect(bounds, this.size, opts.padding ?? 24, this.minZoom, Math.min(this.maxZoom, 2)),
      opts,
    );
  }

  /** Centers an item and zooms to fit it, never zooming in past 2x. */
  zoomToItem(item: ItemRef, opts: { animate?: boolean } = {}): void {
    const b = this.itemBounds(item);
    if (!b || this.size.width === 0) return;
    const fit = fitRect(b, this.size, 80, this.minZoom, Math.min(this.maxZoom, 2));
    this.setViewport(fit, opts);
  }

  screenToDiagram(p: Point): Point {
    return screenToDiagram(this.viewport, p);
  }

  diagramToScreen(p: Point): Point {
    return diagramToScreen(this.viewport, p);
  }

  /** Diagram-space bounds of every node, link waypoint and annotation. An empty diagram returns a zero rect. */
  getBounds(): Rect {
    const rects: Rect[] = [];
    for (const n of this.store.nodes.values()) rects.push(nodeBounds(n, this.symbols.get(n.type)));
    for (const l of this.store.links.values())
      for (const p of l.waypoints ?? []) rects.push({ ...p, width: 0, height: 0 });
    for (const a of this.store.annotations.values()) {
      const b = this.itemBounds({ kind: 'annotation', id: a.id });
      if (b) rects.push(b);
    }
    // While a comparison is shown, removed items are drawn as ghosts: fit them too.
    for (const n of this.diffBase?.base.nodes ?? [])
      if (!this.store.nodes.has(n.id)) rects.push(nodeBounds(n, this.symbols.get(n.type)));
    return unionRects(rects) ?? { x: 0, y: 0, width: 0, height: 0 };
  }

  /** Rendered polyline of a link (port points included), as routed. Undefined before mount or the first render. */
  getLinkPath(linkId: string): Point[] | undefined {
    this.renderer?.flush();
    return this.renderer?.getLinkPath(linkId);
  }
  /** Swallows the click that follows a gesture (an editor drag, for example) so it doesn't select or emit nodeClick. */
  /** @internal Host drag-and-drop sources registered with acceptDrop (FR-50). */
  readonly dropSources = new Set<DropSource>();

  /**
   * Accepts HTML5 drag-and-drop from host elements (FR-50): drops whose dataTransfer has `mimeType`
   * become the node `toNode` builds, checked with `canDrop`. Edit mode only. Returns an unsubscribe.
   */
  acceptDrop(source: DropSource): () => void {
    this.dropSources.add(source);
    return () => {
      this.dropSources.delete(source);
    };
  }

  /**
   * Placement mode (FR-50): a preview of `type` follows the pointer (it starts at the centre of the
   * view), `canDrop` marks it as refused, a click or tap places it, arrow keys nudge it, Enter places
   * it and Esc cancels. Needs edit mode and a mounted diagram.
   */
  startPlacement(type: string, init: Partial<NodeModel> = {}): void {
    if (!this.internal.has('placement')) {
      // No editor is listening (view mode, or not mounted yet): say so once instead of failing silently.
      if (!this.warnedPlacement) {
        this.warnedPlacement = true;
        console.warn('[pipeline-view] startPlacement() needs a mounted diagram in edit mode.');
      }
      return;
    }
    this.internal.emit('placement', { type, init });
  }

  private warnedPlacement = false;

  /**
   * Connects two ports, applying every rule (roles, limits, direction, graph rules, `canConnect`), as
   * one undo step (FR-54). The link is stored in flow order. Returns its id, or the explained refusal.
   */
  connect(from: LinkEnd, to: LinkEnd, kind: LinkKind = 'process'): ConnectResult {
    return connectLink(this, from, to, kind);
  }

  suppressNextClick(): void {
    if (this.viewportController) this.viewportController.suppressClick = true;
  }

  /** Standalone SVG of the whole diagram (or the visible viewport) with styles inlined (FR-32). */
  exportSVG(opts?: { viewportOnly?: boolean; padding?: number }): string {
    if (!this.view) throw new Error('exportSVG() needs a mounted diagram');
    return exportSvgString(this, this.view, opts);
  }

  /** PNG of the SVG export. `scale` defaults to 2 for crisp output on high-DPI screens. */
  exportPNG(opts?: { viewportOnly?: boolean; padding?: number; scale?: number }): Promise<Blob> {
    if (!this.view) return Promise.reject(new Error('exportPNG() needs a mounted diagram'));
    return exportPng(this, this.view, opts);
  }

  /** Node types rendered as HTML (FR-45) and their sizing. */
  htmlNodeTypes(): Record<string, 'fixed' | 'content'> {
    // Hot path (every symbol lookup goes through ViewRegistry): memoized on the option's identity.
    const spec = this.options.nodeRenderers;
    if (this.htmlTypesCache && this.htmlTypesCache.spec === spec) return this.htmlTypesCache.types;
    const out: Record<string, 'fixed' | 'content'> = {};
    for (const [type, spec] of Object.entries(this.options.nodeRenderers ?? {})) {
      out[type] = typeof spec === 'function' ? 'fixed' : (spec.sizing ?? 'fixed');
    }
    this.htmlTypesCache = { spec, types: out };
    return out;
  }

  /**
   * @internal Reports the measured content size of an HTML node (FR-45). Bounds, ports and routes
   * follow it. It's view state, so there's no modelChange and no undo step.
   */
  setMeasuredSize(id: string, size: Size | null): void {
    const prev = this.measuredSizes.get(id);
    if (size && prev && prev.width === size.width && prev.height === size.height) return;
    if (!size && !prev) return;
    if (size) this.measuredSizes.set(id, { width: size.width, height: size.height });
    else this.measuredSizes.delete(id);
    (this.symbols as ViewRegistry).refresh();
    this.internal.emit('geometry', { ids: [id] });
  }

  /** Maps a DOM element (an event target) to the diagram item it belongs to, using the data-*-id attributes. */
  hitTest(
    target: EventTarget | null,
  ): ItemRef | { kind: 'port'; node: string; port: string } | null {
    const el = target as Element | null;
    if (!el?.closest || !this.view?.root.contains(el)) return null;
    const port = el.closest<HTMLElement | SVGElement>('[data-port-id]');
    const node = el.closest<HTMLElement | SVGElement>('[data-node-id]');
    if (port && node)
      return { kind: 'port', node: node.dataset.nodeId!, port: port.dataset.portId! };
    if (node) return { kind: 'node', id: node.dataset.nodeId! };
    const link = el.closest<HTMLElement | SVGElement>('[data-link-id]');
    if (link) return { kind: 'link', id: link.dataset.linkId! };
    const badge = el.closest<SVGElement>('[data-issue-node], [data-issue-link]');
    if (badge) {
      const nodeId = badge.getAttribute('data-issue-node');
      return nodeId !== null
        ? { kind: 'node', id: nodeId }
        : { kind: 'link', id: badge.getAttribute('data-issue-link')! };
    }
    const ann = el.closest<HTMLElement | SVGElement>('[data-annotation-id]');
    if (ann) return { kind: 'annotation', id: ann.dataset.annotationId! };
    return null;
  }

  /** Approximate bounds of one item. Links use their end nodes and waypoints, since the route lives in the renderer. */
  itemBounds(item: ItemRef): Rect | undefined {
    if (item.kind === 'node') {
      const n = this.store.nodes.get(item.id);
      return n && nodeBounds(n, this.symbols.get(n.type));
    }
    if (item.kind === 'link') {
      const l = this.store.links.get(item.id);
      if (!l) return undefined;
      const ends = [l.from.node, l.to.node].map((id) => this.itemBounds({ kind: 'node', id }));
      const pts = (l.waypoints ?? []).map((p) => ({ ...p, width: 0, height: 0 }));
      return unionRects([...ends.filter((r): r is Rect => !!r), ...pts]);
    }
    const a = this.store.annotations.get(item.id);
    if (!a) return undefined;
    const anchor = a.anchor && this.store.nodes.get(a.anchor.node);
    const x = a.position.x + (anchor?.position.x ?? 0);
    const y = a.position.y + (anchor?.position.y ?? 0);
    const size = a.kind === 'html' ? a.size : undefined;
    return { x, y, width: size?.width ?? 0, height: size?.height ?? 0 };
  }

  // ---- comparison (FR-51) --------------------------------------------------

  /**
   * Marks how the diagram differs from `base`: `data-diff` on added, moved and changed items, and faded
   * ghosts for removed ones. The marks follow edits until cleared with `showDiff(null)`. For a summary list,
   * use `getDiff(base, diagram.toJSON())`.
   */
  showDiff(base: DiagramModel | null, opts: GetDiffOptions = {}): void {
    this.diffBase = base ? { base, opts } : null;
    this.diffLayer?.set(base, opts);
  }

  /** The base passed to showDiff(), or null when no comparison is shown. */
  getDiffBase(): DiagramModel | null {
    return this.diffBase?.base ?? null;
  }

  // ---- problem markers (FR-48) ---------------------------------------------

  /**
   * Replaces all problem markers. Issues are view state (validation results, save errors): they're never
   * saved with the model, and they survive load() and edits for as long as their item exists.
   */
  setIssues(issues: IssueMap): void {
    this.issues = { nodes: { ...issues.nodes }, links: { ...issues.links } };
    this.issueLayer?.set(this.issues);
  }

  /** The current problem markers, as last passed to setIssues(). */
  getIssues(): IssueMap {
    return { nodes: { ...this.issues.nodes }, links: { ...this.issues.links } };
  }

  /**
   * Steps to the next (or previous) item with issues, in reading order, starting after the current
   * selection. Selects it, scrolls it into view and focuses it if it's a node. Returns the item, or null
   * when no item has issues. Bound to F8 / Shift+F8.
   */
  nextIssue(direction: 1 | -1 = 1): ItemRef | null {
    const items = this.issueLayer?.items() ?? [];
    if (items.length === 0) return null;
    const current = this.getSelection()[0];
    const at = current
      ? items.findIndex((i) => i.kind === current.kind && i.id === current.id)
      : -1;
    const index =
      at < 0
        ? direction > 0
          ? 0
          : items.length - 1
        : (at + direction + items.length) % items.length;
    const item = items[index]!;
    this.setSelection([item]);
    if (item.kind === 'node') this.keyboard?.setFocused(item.id);
    else {
      const b = this.itemBounds(item);
      if (b) this.keyboard?.reveal(b);
    }
    return item;
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
    this.cancelAnimation();
    if (this.fitFrame)
      this.view?.root.ownerDocument.defaultView?.cancelAnimationFrame(this.fitFrame);
    this.culling?.destroy();
    this.keyboard?.destroy();
    this.diffLayer?.destroy();
    this.issueLayer?.destroy();
    this.detachPointerEvents?.();
    this.overlay?.destroy();
    this.renderer?.destroy();
    this.viewportController?.destroy();
    this.resizeObserver?.disconnect();
    this.view?.root.remove();
    this.view = undefined;
    this.events.clear();
    this.internal.clear();
    this.undoStack = [];
    this.redoStack = [];
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('Diagram has been destroyed');
  }
}

function prefersReducedMotion(win: Window): boolean {
  return win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
