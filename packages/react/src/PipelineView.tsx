import {
  Diagram,
  attachEditor,
  type AnnotationModel,
  type DiagramEvents,
  type DiagramMode,
  type DiagramModel,
  type DiagramOptions,
  type EditorControllerOptions,
  type HtmlRenderer,
  type NodeRendererSpec,
  type NodeModel,
  type DataRecord,
  type PortDef,
  nodePorts,
  type IssueMap,
  type SymbolDef,
  type ThemeName,
} from '@pipeline-view/core';
import {
  createContext,
  memo,
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ComponentType,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { PortalStore, type PortalEntry, type ReactRenderer } from './portals';

export const DiagramContext = createContext<Diagram | null>(null);

type Handler<K extends keyof DiagramEvents> = (payload: DiagramEvents[K]) => void;

export interface PipelineViewProps {
  /**
   * The model to show. When its identity changes, a new version of the same document (sharing node or
   * link ids) is applied with `diagram.patch()`, keeping viewport, selection and live data; a different
   * document is loaded from scratch. The exact object this view last reported through onModelChange is
   * ignored, so controlled usage costs nothing on every edit.
   */
  model?: DiagramModel;
  /**
   * Identifies the document shown, for example a saved diagram's id. When it changes, the new `model`
   * is loaded from scratch: fit on load, cleared selection, fresh undo history and dirty baseline.
   * While it stays the same, model updates are patched in. Without it, documents that share node or
   * link ids are treated as one, so set it whenever your app switches between documents.
   */
  documentKey?: string | number;
  /**
   * How a new version of the same document (a changed `model`) is applied. 'host' (the default)
   * patches it outside the undo history, since the host owns its history. 'undoable' makes each such
   * update one undo step, like a canvas edit, for hosts whose own panels (an inspector, a side panel)
   * edit the document and want Ctrl+Z to cover them. Loading a different document always starts a
   * fresh history.
   */
  modelUpdates?: 'host' | 'undoable';
  mode?: DiagramMode;
  theme?: ThemeName;
  /**
   * A base model to compare against (FR-51): added, moved and changed items get `data-diff`, and removed
   * ones are drawn as ghosts. Applied with `showDiff` when the identity changes; omit it to clear.
   */
  compareWith?: DiagramModel | null;
  /**
   * Problem markers on nodes and links (FR-48), e.g. validation results. Applied with `setIssues` whenever
   * the object's identity changes, so memoize it. Never saved with the model.
   */
  issues?: IssueMap;
  /** Instance-local symbols, added to the global registry. */
  symbols?: SymbolDef[];
  /** React overlay renderers, referenced by HtmlAnnotation.renderer or a node's data.overlay. */
  renderers?: Record<string, ReactRenderer>;
  /**
   * React components rendered inside nodes of these types (FR-45). The library draws the ports and the
   * selection, and each node re-renders only when its own data, status or selection changes. Use
   * `{ component, sizing: 'content' }` to size the node from its content. The set of types is read
   * once, at creation; the components may change.
   */
  nodeRenderers?: Record<string, AnyNodeRendererEntry>;
  /**
   * Annotations to hide as display state (ids or a predicate): the model, history and routing don't
   * change. Applied whenever the value's identity changes, so memoize it.
   */
  hiddenAnnotations?: Iterable<string> | ((a: AnnotationModel) => boolean) | null;
  /**
   * Lets users drag annotations (reading cards, text): `'edit'` in edit mode only, `'always'` in view
   * mode too. Default false. `AnnotationModel.draggable` overrides it per annotation. Can change at any time.
   */
  annotationDrag?: DiagramOptions['annotationDrag'];
  /**
   * Where a finished drag goes: `'model'` (the default) commits one undoable change, reported through
   * onModelChange. `'display'` leaves the model alone: save the position from `onAnnotationMove` (when
   * `final`) and restore it with `diagram.setAnnotationPositions()`.
   */
  annotationMoves?: DiagramOptions['annotationMoves'];
  /**
   * Accessible name of a draggable annotation (its aria-label, and the name in move announcements).
   * Return undefined for the default. Can change at any time; names update in place.
   */
  annotationName?: DiagramOptions['annotationName'];
  /** Phrases or localizes the move announcements. Can change at any time. */
  annotationMessages?: DiagramOptions['annotationMessages'];
  /** Accessible name for the diagram root. Unlike `options.ariaLabel`, it can change at any time. */
  ariaLabel?: string;
  /** Other DiagramOptions. Read once, when the diagram is created. */
  options?: Omit<
    DiagramOptions,
    | 'mode'
    | 'theme'
    | 'symbols'
    | 'htmlRenderers'
    | 'annotationDrag'
    | 'annotationMoves'
    | 'annotationName'
    | 'annotationMessages'
  >;
  /** Editor options (guides, port snap). The editor attaches itself whenever mode is 'edit'. Read once. */
  editor?: EditorControllerOptions;
  /**
   * Zoom to fit after a model load, once HTML/React content has been measured (FR-47). `true` (the
   * default) fits unless `initialViewport` is set; `'always'` also overrides it; `false` never fits.
   */
  fitOnLoad?: boolean | 'always' | 'if-no-viewport' | 'never';
  /** The viewport to start with, for example one saved from `onViewportChange` when `final` is true. */
  initialViewport?: DiagramOptions['initialViewport'];
  onReady?: (diagram: Diagram) => void;
  onNodeClick?: Handler<'nodeClick'>;
  onNodeDoubleClick?: Handler<'nodeDoubleClick'>;
  onLinkClick?: Handler<'linkClick'>;
  onContextMenu?: Handler<'contextMenu'>;
  onHover?: Handler<'hover'>;
  onSelectionChange?: Handler<'selectionChange'>;
  /**
   * User edits and undo/redo (`origin: 'user' | 'history'`). Changes the host made itself, through a new
   * `model` prop (`origin: 'host'`), aren't reported unless `emitHostChanges` is set.
   */
  onModelChange?: Handler<'modelChange'>;
  /** Also report the host's own changes (`origin: 'host'`) through onModelChange. Default false. */
  emitHostChanges?: boolean;
  onViewportChange?: Handler<'viewportChange'>;
  onConnectRejected?: Handler<'connectRejected'>;
  onChangeDropped?: Handler<'changeDropped'>;
  /** An annotation is being dragged; `final` is true once, when the move ends. */
  onAnnotationMove?: Handler<'annotationMove'>;
  className?: string;
  style?: CSSProperties;
  /** Rendered after the canvas, inside the DiagramContext (toolbars, legends, palettes). */
  children?: ReactNode;
}

const EVENT_PROPS = {
  nodeClick: 'onNodeClick',
  nodeDoubleClick: 'onNodeDoubleClick',
  linkClick: 'onLinkClick',
  contextMenu: 'onContextMenu',
  hover: 'onHover',
  selectionChange: 'onSelectionChange',
  modelChange: 'onModelChange',
  viewportChange: 'onViewportChange',
  connectRejected: 'onConnectRejected',
  changeDropped: 'onChangeDropped',
  annotationMove: 'onAnnotationMove',
} as const satisfies Record<keyof DiagramEvents, keyof PipelineViewProps>;

/**
 * React wrapper around a core Diagram. The diagram is created on the client in an effect, so the
 * component is safe to render during SSR. The ref exposes the Diagram instance (a DiagramApi plus
 * the editor-facing extras such as preview() and hitTest()) once mounted, and null before that.
 */
export const PipelineView = forwardRef<Diagram | null, PipelineViewProps>(
  function PipelineView(props, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    const propsRef = useRef(props);
    // Latest props for long-lived callbacks (event forwarding, renderer lookup). Layout effects run before
    // the creation effect, so it also sees current props.
    useLayoutEffect(() => {
      propsRef.current = props;
    });
    const [portals] = useState(() => new PortalStore());
    const [diagram, setDiagram] = useState<Diagram | null>(null);
    const lastEmitted = useRef<DiagramModel | undefined>(undefined);
    const loaded = useRef<DiagramModel | undefined>(undefined);
    const loadedKey = useRef<string | number | undefined>(undefined);

    useImperativeHandle(ref, () => diagram as Diagram, [diagram]);

    // Create and mount on the client. StrictMode's double-invoke gets a fresh diagram each time.
    useEffect(() => {
      const host = hostRef.current!;
      const p = propsRef.current;
      // Resolve renderer names lazily, so renderers added after creation still work.
      const htmlRenderers = new Proxy({} as Record<string, HtmlRenderer>, {
        get: (_t, name) =>
          typeof name === 'string' && propsRef.current.renderers?.[name]
            ? portals.htmlRenderer(name)
            : undefined,
      });
      const nodeRenderers: Record<string, NodeRendererSpec> = {};
      for (const [type, entry] of Object.entries(p.nodeRenderers ?? {})) {
        const render = portals.htmlRenderer(`node:${type}`);
        nodeRenderers[type] = withSizing(entry) ? { render, sizing: entry.sizing } : render;
      }
      const fit = p.fitOnLoad ?? true;
      const d = new Diagram({
        ...p.options,
        ariaLabel: p.ariaLabel ?? p.options?.ariaLabel,
        initialViewport: p.initialViewport ?? p.options?.initialViewport,
        fitOnLoad: fit === true ? 'if-no-viewport' : fit === false ? 'never' : fit,
        mode: p.mode,
        theme: p.theme,
        annotationDrag: p.annotationDrag,
        annotationMoves: p.annotationMoves,
        // Read through the latest props, so both can change after creation.
        annotationName: (a, anchor) => propsRef.current.annotationName?.(a, anchor),
        annotationMessages: {
          moved: (name, position, final) =>
            propsRef.current.annotationMessages?.moved?.(name, position, final),
          cancelled: (name) => propsRef.current.annotationMessages?.cancelled?.(name),
        },
        symbols: p.symbols,
        htmlRenderers,
        nodeRenderers,
      });
      d.mount(host);
      // The editor follows setMode itself; it's idle in view mode.
      const detachEditor = attachEditor(d, {
        getLinkPath: (id) => d.getLinkPath(id),
        ...p.editor,
      });
      const offs = (Object.keys(EVENT_PROPS) as (keyof DiagramEvents)[]).map((event) =>
        d.on(event, (payload) => {
          if (event === 'modelChange') {
            const change = payload as DiagramEvents['modelChange'];
            // The host's own document (model prop → patch()) isn't echoed back by default (FR-44).
            if (change.origin === 'host' && !propsRef.current.emitHostChanges) return;
            lastEmitted.current = change.model;
          }
          const fn = propsRef.current[EVENT_PROPS[event]] as ((x: unknown) => void) | undefined;
          fn?.(payload);
        }),
      );
      loaded.current = undefined;
      setDiagram(d);
      p.onReady?.(d);
      return () => {
        for (const off of offs) off();
        detachEditor();
        d.destroy();
        setDiagram(null);
      };
    }, [portals]);

    const { model, mode, theme, compareWith, issues, symbols, documentKey, ariaLabel } = props;

    useEffect(() => {
      if (!diagram || !model) return;
      const keyChanged = documentKey !== undefined && documentKey !== loadedKey.current;
      if (!keyChanged && (model === loaded.current || model === lastEmitted.current)) return;
      const prev = loaded.current;
      loaded.current = model;
      // Controlled mode (FR-44): a new version of the same document is applied as a patch, so the
      // viewport, selection, live data and untouched routes survive. A different document is loaded
      // from scratch (fit, fresh selection, history and dirty baseline). `documentKey` says which is
      // which; without it, shared node/link ids are the (weaker) heuristic.
      const sameDocument =
        documentKey !== undefined ? !keyChanged : !!prev && sharesItems(prev, model);
      loadedKey.current = documentKey;
      if (sameDocument) {
        diagram.patch(model, { undoable: propsRef.current.modelUpdates === 'undoable' });
        return;
      }
      diagram.load(model); // the diagram fits on load per fitOnLoad, after content is measured
    }, [diagram, model, documentKey]);

    useEffect(() => {
      if (diagram && mode) diagram.setMode(mode);
    }, [diagram, mode]);

    useEffect(() => {
      if (diagram && theme) diagram.setTheme(theme);
    }, [diagram, theme]);

    useEffect(() => {
      if (diagram && ariaLabel !== undefined) diagram.setAriaLabel(ariaLabel);
    }, [diagram, ariaLabel]);

    const { hiddenAnnotations } = props;
    useEffect(() => {
      diagram?.setHiddenAnnotations(hiddenAnnotations ?? null);
    }, [diagram, hiddenAnnotations]);

    const { annotationDrag, annotationMoves } = props;
    useEffect(() => {
      diagram?.setAnnotationDrag(annotationDrag ?? false, annotationMoves ?? 'model');
    }, [diagram, annotationDrag, annotationMoves]);

    const { annotationName } = props;
    useEffect(() => {
      // Cheap (attribute compares only), so an inline function is fine.
      diagram?.refreshAnnotationNames();
    }, [diagram, annotationName]);

    useEffect(() => {
      diagram?.showDiff(compareWith ?? null);
    }, [diagram, compareWith]);

    useEffect(() => {
      diagram?.setIssues(issues ?? {});
    }, [diagram, issues]);

    useEffect(() => {
      if (diagram && symbols?.length) diagram.symbols.register(...symbols);
    }, [diagram, symbols]);

    const entries = useSyncExternalStore(portals.subscribe, portals.getSnapshot, serverSnapshot);

    return (
      <DiagramContext.Provider value={diagram}>
        <div
          ref={hostRef}
          className={props.className}
          style={{ position: 'relative', ...props.style }}
        />
        {entries.map((e) =>
          e.name.startsWith('node:') ? (
            <NodeSlot
              key={e.key}
              entry={e}
              diagram={diagram}
              component={componentOf(props.nodeRenderers?.[e.name.slice(5)])}
            />
          ) : (
            <PortalSlot key={e.key} entry={e} render={props.renderers?.[e.name]} />
          ),
        )}
        {props.children}
      </DiagramContext.Provider>
    );
  },
);

const NO_ENTRIES: PortalEntry[] = [];
const serverSnapshot = () => NO_ENTRIES;

/** One overlay slot. Memoized on the entry object, which changes only when that slot's item changes. */
/** Props of a React node renderer (FR-45). */
/** Props of a React node renderer. `D` types the node's data. */
export interface NodeRendererProps<D extends DataRecord = DataRecord> {
  node: NodeModel<D>;
  data: D | undefined;
  status?: string;
  selected: boolean;
  /** The node's ports, resolved for this instance. The library draws them; use them for layout hints. */
  ports: PortDef[];
}

export type NodeRendererEntry<D extends DataRecord = DataRecord> =
  | ComponentType<NodeRendererProps<D>>
  | { component: ComponentType<NodeRendererProps<D>>; sizing?: 'fixed' | 'content' };

/**
 * An entry for any data type: the map holds renderers typed for different nodes, and each component
 * gets its own node's data. (`never` doesn't work here: component types carry covariant statics such
 * as `defaultProps`.)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNodeRendererEntry = NodeRendererEntry<any>;

/** The `{ component, sizing }` form (a component itself may be a function or an exotic object). */
const withSizing = (
  e: AnyNodeRendererEntry,
): e is Extract<AnyNodeRendererEntry, { component: unknown }> =>
  typeof e === 'object' && e !== null && 'component' in e;
const componentOf = (
  e: AnyNodeRendererEntry | undefined,
): ComponentType<NodeRendererProps> | undefined =>
  e === undefined ? undefined : withSizing(e) ? e.component : e;

const NO_SELECTION = () => () => {};

/** One React node. Memoized on its entry, which changes only when that node's data or status changes. */
const NodeSlot = memo(function NodeSlot({
  entry,
  diagram,
  component: Component,
}: {
  entry: PortalEntry;
  diagram: Diagram | null;
  component: ComponentType<NodeRendererProps> | undefined;
}) {
  const id = entry.item.id;
  const selected = useSyncExternalStore(
    diagram ? (fn) => diagram.on('selectionChange', fn) : NO_SELECTION,
    () => !!diagram?.getSelection().some((r) => r.kind === 'node' && r.id === id),
    () => false,
  );
  const node = diagram?.store.nodes.get(id);
  if (!Component || !node || !diagram) return null;
  const ports = nodePorts(diagram.symbols.get(node.type), node);
  return createPortal(
    <Component
      node={node}
      data={entry.item.data}
      status={entry.item.status}
      selected={selected}
      ports={ports}
    />,
    entry.el,
  );
});

const PortalSlot = memo(function PortalSlot({
  entry,
  render,
}: {
  entry: PortalEntry;
  render: ReactRenderer | undefined;
}) {
  return render ? createPortal(render(entry.item), entry.el) : null;
});

/** True when two models share at least one node or link id, i.e. they're versions of one document. */
function sharesItems(a: DiagramModel, b: DiagramModel): boolean {
  const ids = new Set([...a.nodes.map((n) => `n:${n.id}`), ...a.links.map((l) => `l:${l.id}`)]);
  return b.nodes.some((n) => ids.has(`n:${n.id}`)) || b.links.some((l) => ids.has(`l:${l.id}`));
}

/** The Diagram of the nearest <PipelineView>, or null before it mounts. */
export function useDiagram(): Diagram | null {
  return useContext(DiagramContext);
}
