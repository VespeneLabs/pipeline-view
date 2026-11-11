/**
 * Public Diagram API contract (PRD FR-2..4, FR-21..32). Implemented in core and wrapped by @pipeline-view/react.
 */
import type {
  AnnotationModel,
  DataRecord,
  DiagramModel,
  LinkEnd,
  LinkKind,
  LinkModel,
  ModelPatch,
  NodeModel,
  Point,
  Rect,
} from '../model/types';
import type { SymbolDef } from '../symbols/types';
import type { RouterOptions } from '../routing/types';
import type { RoutingWorkerOptions } from '../routing/worker-client';

export type DiagramMode = 'view' | 'edit';
export type ThemeName = 'light' | 'dark' | 'auto';

export interface Viewport {
  /** Translation in screen pixels. */
  x: number;
  y: number;
  zoom: number;
}

/**
 * Mounts host content into an HTML overlay slot. It returns a cleanup function.
 * React bindings implement it with portals. Vanilla users write into `el` directly.
 *
 * Lifecycle: it's called once when the item appears, then again with the same `el` whenever the item's
 * data or status changes. Implementations must be idempotent. Only the cleanup returned by the first
 * call is kept, and it runs when the item is removed. For annotations anchored to a node, `data` is the
 * node's live data merged under the annotation's own data, and `status` falls back to the node's.
 */
/**
 * Renders an overlay slot. `D` types `item.data` (an anchored annotation sees its node's data merged
 * under its own). Checked bivariantly, like a method, so an `HtmlRenderer<MyData>` goes into
 * `htmlRenderers` without a cast.
 */
export type HtmlRenderer<D extends DataRecord = DataRecord> = {
  bivarianceHack(
    el: HTMLElement,
    item: { kind: 'node' | 'annotation'; id: string; data: D | undefined; status?: string },
  ): void | (() => void);
}['bivarianceHack'];

/** Built-in refusal codes (FR-42). Hosts may return their own codes too. */
export type RefusalCode =
  | 'kind-not-accepted'
  | 'duplicate'
  | 'port-full'
  | 'same-port'
  | 'direction'
  | 'cycle'
  | 'self-loop'
  | 'max-links-between-nodes'
  | 'missing-port'
  | (string & {});

/**
 * Result of a validation hook (FR-42). `true` allows, `false` refuses without a reason, and the object
 * form refuses with a message for the user and an optional machine-readable code.
 */
export type ValidationResult =
  | boolean
  | {
      ok: false;
      reason: string;
      code?: RefusalCode;
      /** Machine-readable context, for example `{ cycleNodes: string[] }`. */
      detail?: Record<string, unknown>;
    };

/** Context passed to `refusalMessages` for localizing a built-in refusal. */
/**
 * The ends of a refused connection, shared by `RefusalContext`, the `connectRejected` event and
 * `ConnectResult`, so they always agree.
 */
export interface RefusalEnds {
  /** Source end, always in flow order (outlet → inlet), however the user dragged. */
  from: LinkEnd;
  /** Target end, always in flow order. */
  to: LinkEnd;
  /** The ends as the user dragged them (or as passed), present only when that differs from flow order. */
  dragFrom?: LinkEnd;
  dragTo?: LinkEnd;
}

export interface RefusalContext extends RefusalEnds {
  kind: LinkKind;
  detail?: Record<string, unknown>;
}

/** One step of undo history, as JSON-serializable patches (FR-44). */
export interface HistoryEntry {
  /** Re-applies the change (redo). */
  forward: ModelPatch;
  /** Reverts the change (undo). */
  inverse: ModelPatch;
}

/**
 * Host-owned undo history (FR-44), for apps that keep the document in their own store. The diagram
 * pushes one entry per undoable transaction. undo()/redo() return the entry to apply (and move it
 * between the host's stacks), or undefined when there's nothing to do.
 */
export interface HistoryAdapter {
  push(entry: HistoryEntry): void;
  undo(): HistoryEntry | undefined;
  redo(): HistoryEntry | undefined;
  canUndo?(): boolean;
  canRedo?(): boolean;
}

/** Items a delete would remove, including links removed along with their nodes (FR-43). */
export interface DeleteRequest {
  nodes: string[];
  links: string[];
  annotations: string[];
}

/**
 * A problem marker on a node or link (FR-48). Issues are view state: they're never part of the saved
 * model (validation results, server save errors).
 */
export interface Issue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  code?: string;
}

/** All issues at once, keyed by item id (FR-48). Passing a new map replaces the previous one. */
export interface IssueMap {
  nodes?: Record<string, Issue[]>;
  links?: Record<string, Issue[]>;
}

/** How an item differs from a base model (FR-51). */
export type DiffMark = 'added' | 'removed' | 'moved' | 'changed';

/** Summary of the differences between two models (FR-51), for a list next to the canvas. */
export interface ModelComparison {
  nodes: { id: string; mark: DiffMark }[];
  links: { id: string; mark: DiffMark }[];
}

/** Result of a programmatic connect (FR-54). */
export type ConnectResult =
  | { ok: true; id: string }
  | ({
      ok: false;
      code: RefusalCode;
      reason: string;
      detail?: Record<string, unknown>;
    } & Partial<RefusalEnds>);

/** A drag-and-drop source from any element (FR-50). */
export interface DropSource {
  mimeType: string;
  /** Builds the node to drop at `point` (diagram coordinates), or null to ignore the drop. */
  toNode: (data: DataTransfer, point: Point) => NodeModel | null;
}

/** A node renderer: an HtmlRenderer, or one with sizing (FR-45). Default sizing: 'fixed'. */
export type NodeRendererSpec =
  HtmlRenderer | { render: HtmlRenderer; sizing?: 'fixed' | 'content' };

export interface DiagramOptions {
  mode?: DiagramMode;
  theme?: ThemeName;
  /** Symbols to register on this instance, in addition to globally registered ones. */
  symbols?: SymbolDef[];
  /** Renderers referenced by HtmlAnnotation.renderer, or by a node's data.overlay. */
  htmlRenderers?: Record<string, HtmlRenderer>;
  /**
   * Renders nodes of these types as HTML inside the node's box (FR-45). The library still draws the
   * ports and the selection. With `sizing: 'content'`, the node takes the measured size of its content
   * (view state, not saved), and port positions scale from the symbol's declared size.
   */
  nodeRenderers?: Record<string, NodeRendererSpec>;
  grid?: { size: number; snap: boolean; visible: boolean };
  minZoom?: number;
  maxZoom?: number;
  routing?: RouterOptions;
  /**
   * Route links around node labels too, not only around node bodies (default true). The label's box
   * is estimated from its text, so it needs no layout read.
   */
  routeAroundLabels?: boolean;
  /** Edit-mode validation hooks (FR-29, FR-42). Return a reason to explain a refusal. */
  canConnect?: (
    from: { node: NodeModel; port: string },
    to: { node: NodeModel; port: string },
    kind: string,
  ) => ValidationResult;
  canDrop?: (type: string, position: Point) => ValidationResult;
  /**
   * Links always run from an 'out' port to an 'in' port, and arrows follow (FR-41). With `kinds`, only
   * links of those kinds are directed (for example process lines but not signals).
   */
  directed?: boolean | { kinds?: LinkKind[] };
  /** Host-localized text for built-in refusals. Return undefined to keep the default message (FR-42). */
  refusalMessages?: (code: RefusalCode, ctx: RefusalContext) => string | undefined;
  /** Whether `canConnect` runs after (default) or before the built-in checks (FR-42). */
  canConnectOrder?: 'after-builtins' | 'before-builtins';
  /** Whole-graph rules (FR-49). Refusal codes: 'cycle', 'self-loop', 'max-links-between-nodes'. */
  noCycles?: boolean | { kinds?: LinkKind[] };
  noSelfLoops?: boolean;
  maxLinksBetweenNodes?: number;
  /**
   * Undo history (FR-44). Omitted: the diagram keeps its own. `false`: no history (the host owns
   * undo). An adapter: the host stores the entries.
   */
  history?: false | HistoryAdapter;
  /**
   * Asked before items are deleted; resolve false to cancel (FR-43). While a returned Promise is pending,
   * the change is rolled back. It's re-applied when the Promise resolves true, unless the model changed in
   * the meantime: then the approved change is dropped rather than replayed over newer edits.
   */
  onBeforeDelete?: (items: DeleteRequest) => boolean | Promise<boolean>;
  /** Veto for any transaction, before it's committed (FR-43). Promises behave as for onBeforeDelete. */
  beforeChange?: (diff: ModelDiff, patch: ModelPatch) => boolean | Promise<boolean>;
  /** Viewport to start with (FR-47), for example one the host saved from `viewportChange` with `final`. */
  initialViewport?: Viewport;
  /** When to zoom to fit after load (FR-47). Default 'if-no-viewport'. */
  fitOnLoad?: 'always' | 'if-no-viewport' | 'never';
  /**
   * The smallest zoom that fitting (on load, or `zoomToFit()`) uses. When the whole diagram doesn't fit
   * at this zoom, the top-left part shows and the rest is reachable by panning. Unlike `minZoom`, it
   * doesn't limit manual zoom. Default: no floor beyond `minZoom`.
   */
  fitMinZoom?: number;
  /**
   * Large diagrams (FR-55): render only what's visible above a node count (default on; threshold
   * default 300), hide detail below zoom thresholds per layer, and optionally route in a Web Worker.
   */
  culling?: boolean | { threshold?: number; margin?: number };
  lod?: false | { labels?: number; overlays?: number; ports?: number };
  /**
   * Route the initial full pass in a Web Worker for diagrams with at least `culling.threshold` links
   * (FR-55). Links show as straight placeholders until the routes arrive. Pass `{ createWorker }` when
   * your bundler needs its own worker import (or in tests). Incremental re-routes stay on the main thread.
   */
  routingWorker?: boolean | RoutingWorkerOptions;
  /** Accessible name for the diagram root. */
  ariaLabel?: string;
}

export interface ModelDiff {
  added: { nodes: string[]; links: string[]; annotations: string[] };
  removed: { nodes: string[]; links: string[]; annotations: string[] };
  changed: { nodes: string[]; links: string[]; annotations: string[] };
}

export type ItemRef =
  { kind: 'node'; id: string } | { kind: 'link'; id: string } | { kind: 'annotation'; id: string };

export interface PointerEventPayload {
  item: ItemRef;
  /** Pointer position in diagram coordinates. */
  point: Point;
  originalEvent: PointerEvent | MouseEvent;
}

/**
 * Where a model change came from: `'user'` for update() and editor gestures, `'host'` for
 * patch()/applyDiff() (the host's own document), `'history'` for undo/redo (built-in or a HistoryAdapter).
 */
export type ChangeOrigin = 'user' | 'host' | 'history';

export interface DiagramEvents {
  nodeClick: PointerEventPayload;
  nodeDoubleClick: PointerEventPayload;
  linkClick: PointerEventPayload;
  contextMenu: PointerEventPayload | { item: null; point: Point; originalEvent: MouseEvent };
  hover: { item: ItemRef | null; point: Point };
  selectionChange: { selection: ItemRef[] };
  /** Emitted for transactional changes only. Never emitted for setNodeData. */
  modelChange: { diff: ModelDiff; model: DiagramModel; patch?: ModelPatch; origin: ChangeOrigin };
  /** `final` is true once a pan, zoom or animation has settled, so hosts can save once (FR-47). */
  viewportChange: { viewport: Viewport; final?: boolean };
  /**
   * A change approved by an async `onBeforeDelete` / `beforeChange` wasn't applied, because the model
   * changed while the Promise was pending (FR-43). `diff` is the change that was dropped.
   */
  changeDropped: { reason: 'stale'; diff: ModelDiff };
  /** A connect drop on a port or node was refused (FR-42). Drops on empty canvas are cancels and don't fire. */
  connectRejected: RefusalEnds & {
    kind: LinkKind;
    code: RefusalCode;
    /** Final, possibly host-localized, message. */
    reason: string;
    detail?: Record<string, unknown>;
    point: Point;
  };
}

export interface Transaction {
  addNode(node: NodeModel): void;
  updateNode(id: string, patch: Partial<Omit<NodeModel, 'id'>>): void;
  removeNode(id: string): void;
  addLink(link: LinkModel): void;
  updateLink(id: string, patch: Partial<Omit<LinkModel, 'id'>>): void;
  removeLink(id: string): void;
  addAnnotation(a: AnnotationModel): void;
  updateAnnotation(id: string, patch: Partial<AnnotationModel>): void;
  removeAnnotation(id: string): void;
}

export interface DiagramApi {
  load(model: DiagramModel): void;
  toJSON(): DiagramModel;

  /** One render pass and one undo step (FR-3). */
  update(fn: (tx: Transaction) => void, opts?: { undoable?: boolean }): void;
  /** High-frequency live-data path. No undo, no re-route, no modelChange (FR-4). */
  setNodeData(id: string, patch: DataRecord, status?: string): void;
  setNodeDataBatch(updates: Record<string, { data?: DataRecord; status?: string }>): void;

  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;

  getMode(): DiagramMode;
  setMode(mode: DiagramMode): void;
  setTheme(theme: ThemeName): void;

  getViewport(): Viewport;
  setViewport(v: Partial<Viewport>, opts?: { animate?: boolean }): void;
  zoomToFit(opts?: { padding?: number; animate?: boolean; minZoom?: number }): void;
  zoomToItem(item: ItemRef, opts?: { animate?: boolean }): void;
  setHiddenAnnotations(hidden: Iterable<string> | ((a: AnnotationModel) => boolean) | null): void;
  isAnnotationHidden(id: string): boolean;
  screenToDiagram(p: Point): Point;
  diagramToScreen(p: Point): Point;
  getBounds(): Rect;

  getSelection(): ItemRef[];
  setSelection(items: ItemRef[]): void;

  on<K extends keyof DiagramEvents>(
    event: K,
    handler: (payload: DiagramEvents[K]) => void,
  ): () => void;

  // ---- v1.2 (optional until each feature lands; see PRD §11) ----

  /** Applies a patch as one transaction, without a reload, re-route of untouched links, or viewport reset (FR-44). */
  applyDiff?(patch: ModelPatch, opts?: { undoable?: boolean }): void;
  /** Applies only the difference between the current model and `model` (controlled mode, FR-44). Returns that patch. */
  patch?(model: DiagramModel, opts?: { undoable?: boolean }): ModelPatch;
  /** True if the model changed since the last markSaved() or load() (FR-44). */
  isDirty?(): boolean;
  markSaved?(): void;
  /** Replaces all problem markers (FR-48). */
  setIssues?(issues: IssueMap): void;
  /** Connects two ports, applying every validation rule (FR-54). */
  connect?(from: LinkEnd, to: LinkEnd, kind?: LinkKind): ConnectResult;
  /** Accepts HTML5 drag-and-drop from host elements (FR-50). Returns an unsubscribe function. */
  acceptDrop?(source: DropSource): () => void;
  /** Starts placement mode: a preview follows the pointer, a click places it, Esc cancels (FR-50). */
  startPlacement?(type: string, init?: Partial<NodeModel>): void;
  /** Marks items against a base model, or clears the marks with null (FR-51). */
  showDiff?(base: DiagramModel | null): void;

  exportSVG(opts?: { viewportOnly?: boolean; padding?: number }): string;
  exportPNG(opts?: { viewportOnly?: boolean; padding?: number; scale?: number }): Promise<Blob>;

  destroy(): void;
}
