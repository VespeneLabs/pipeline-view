/**
 * Public Diagram API contract (PRD FR-2..4, FR-21..32). Implemented in core and wrapped by @pipeline-view/react.
 */
import type {
  AnnotationModel,
  DataRecord,
  DiagramModel,
  LinkModel,
  NodeModel,
  Point,
  Rect,
} from '../model/types';
import type { SymbolDef } from '../symbols/types';
import type { RouterOptions } from '../routing/types';

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
export type HtmlRenderer = (
  el: HTMLElement,
  item: { kind: 'node' | 'annotation'; id: string; data: DataRecord | undefined; status?: string },
) => void | (() => void);

export interface DiagramOptions {
  mode?: DiagramMode;
  theme?: ThemeName;
  /** Symbols to register on this instance, in addition to globally registered ones. */
  symbols?: SymbolDef[];
  /** Renderers referenced by HtmlAnnotation.renderer, or by a node's data.overlay. */
  htmlRenderers?: Record<string, HtmlRenderer>;
  grid?: { size: number; snap: boolean; visible: boolean };
  minZoom?: number;
  maxZoom?: number;
  routing?: RouterOptions;
  /** Edit-mode validation hooks (FR-29). */
  canConnect?: (
    from: { node: NodeModel; port: string },
    to: { node: NodeModel; port: string },
    kind: string,
  ) => boolean;
  canDrop?: (type: string, position: Point) => boolean;
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

export interface DiagramEvents {
  nodeClick: PointerEventPayload;
  nodeDoubleClick: PointerEventPayload;
  linkClick: PointerEventPayload;
  contextMenu: PointerEventPayload | { item: null; point: Point; originalEvent: MouseEvent };
  hover: { item: ItemRef | null; point: Point };
  selectionChange: { selection: ItemRef[] };
  /** Emitted for transactional changes only. Never emitted for setNodeData. */
  modelChange: { diff: ModelDiff; model: DiagramModel };
  viewportChange: { viewport: Viewport };
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
  zoomToFit(opts?: { padding?: number; animate?: boolean }): void;
  zoomToItem(item: ItemRef, opts?: { animate?: boolean }): void;
  screenToDiagram(p: Point): Point;
  diagramToScreen(p: Point): Point;
  getBounds(): Rect;

  getSelection(): ItemRef[];
  setSelection(items: ItemRef[]): void;

  on<K extends keyof DiagramEvents>(
    event: K,
    handler: (payload: DiagramEvents[K]) => void,
  ): () => void;

  exportSVG(opts?: { viewportOnly?: boolean; padding?: number }): string;
  exportPNG(opts?: { viewportOnly?: boolean; padding?: number; scale?: number }): Promise<Blob>;

  destroy(): void;
}
