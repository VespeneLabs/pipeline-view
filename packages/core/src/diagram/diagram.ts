import type { DataRecord, DiagramModel, Point, Rect, Size } from '../model/types';
import { ModelStore, applyPatch } from '../model/store';
import { SymbolRegistry, globalSymbols } from '../symbols/registry';
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
import { SvgRenderer } from '../render/svg-renderer';
import { OverlayRenderer } from '../render/overlay';
import { attachPointerEvents } from '../render/input';
import { KeyboardNavigation } from '../render/a11y';
import { exportPng, exportSvgString } from '../render/export';
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
  Viewport,
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
}

const MAX_UNDO = 200;
const ANIMATION_MS = 250;

const refKey = (r: ItemRef) => `${r.kind}\u0000${r.id}`;

export class Diagram implements DiagramApi {
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

  /** DOM view. Undefined until mount(). */
  view: View | undefined;
  /** @internal Pan/zoom input. Its `suppressClick` tells click handlers a drag just ended. */
  viewportController: ViewportController | undefined;
  /** @internal SVG renderer. Created on mount. */
  renderer: SvgRenderer | undefined;
  /** @internal Annotations and HTML overlays. Created on mount. */
  overlay: OverlayRenderer | undefined;
  private detachPointerEvents: (() => void) | undefined;
  /** @internal Keyboard focus navigation. Created on mount. */
  keyboard: KeyboardNavigation | undefined;
  private viewport: Viewport = { x: 0, y: 0, zoom: 1 };
  private size: Size = { width: 0, height: 0 };
  private readonly minZoom: number;
  private readonly maxZoom: number;
  private resizeObserver: ResizeObserver | undefined;
  private animFrame = 0;
  private pendingFit: { padding?: number } | null = null;

  constructor(readonly options: DiagramOptions = {}) {
    this.symbols = new SymbolRegistry(globalSymbols);
    if (options.symbols?.length) this.symbols.register(...options.symbols);
    this.mode = options.mode ?? 'view';
    this.theme = options.theme ?? 'auto';
    this.minZoom = options.minZoom ?? DEFAULT_MIN_ZOOM;
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
    this.internal.emit('mount', { view });
    if (this.pendingFit) this.zoomToFit(this.pendingFit);
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
      this.applyViewport(target);
      return;
    }
    const from = this.getViewport();
    const start = win.performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ANIMATION_MS);
      this.applyViewport(t >= 1 ? target : lerpViewport(from, target, t));
      this.animFrame = t >= 1 ? 0 : win.requestAnimationFrame(step);
    };
    this.animFrame = win.requestAnimationFrame(step);
  }

  /** @internal Sets the viewport now, with no clamping or animation (used by input). */
  applyViewport(v: Viewport): void {
    if (v.x === this.viewport.x && v.y === this.viewport.y && v.zoom === this.viewport.zoom) return;
    this.viewport = { ...v };
    if (this.view) applyViewportToView(this.view, v);
    this.internal.emit('viewport', { viewport: this.getViewport() });
    this.events.emit('viewportChange', { viewport: this.getViewport() });
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
    return unionRects(rects) ?? { x: 0, y: 0, width: 0, height: 0 };
  }

  /** Rendered polyline of a link (port points included), as routed. Undefined before mount or the first render. */
  getLinkPath(linkId: string): Point[] | undefined {
    this.renderer?.flush();
    return this.renderer?.getLinkPath(linkId);
  }
  /** Swallows the click that follows a gesture (an editor drag, for example) so it doesn't select or emit nodeClick. */
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
    this.keyboard?.destroy();
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
