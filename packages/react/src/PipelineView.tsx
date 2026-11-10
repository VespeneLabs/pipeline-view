import {
  Diagram,
  attachEditor,
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
  nodeRenderers?: Record<string, NodeRendererEntry>;
  /** Other DiagramOptions. Read once, when the diagram is created. */
  options?: Omit<DiagramOptions, 'mode' | 'theme' | 'symbols' | 'htmlRenderers'>;
  /** Editor options (guides, port snap). The editor attaches itself whenever mode is 'edit'. Read once. */
  editor?: EditorControllerOptions;
  /** Zoom to fit after each model load. Default true. */
  fitOnLoad?: boolean;
  onReady?: (diagram: Diagram) => void;
  onNodeClick?: Handler<'nodeClick'>;
  onNodeDoubleClick?: Handler<'nodeDoubleClick'>;
  onLinkClick?: Handler<'linkClick'>;
  onContextMenu?: Handler<'contextMenu'>;
  onHover?: Handler<'hover'>;
  onSelectionChange?: Handler<'selectionChange'>;
  onModelChange?: Handler<'modelChange'>;
  onViewportChange?: Handler<'viewportChange'>;
  onConnectRejected?: Handler<'connectRejected'>;
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
        nodeRenderers[type] = isComponent(entry) ? render : { render, sizing: entry.sizing };
      }
      const d = new Diagram({
        ...p.options,
        mode: p.mode,
        theme: p.theme,
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
          if (event === 'modelChange')
            lastEmitted.current = (payload as DiagramEvents['modelChange']).model;
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

    const { model, mode, theme, compareWith, issues, symbols, fitOnLoad = true } = props;

    useEffect(() => {
      if (!diagram || !model || model === loaded.current || model === lastEmitted.current) return;
      const prev = loaded.current;
      loaded.current = model;
      // Controlled mode (FR-44): a new version of the same document is applied as a patch, so the
      // viewport, selection, live data and untouched routes survive. A different document (no shared
      // ids) is loaded from scratch.
      if (prev && sharesItems(prev, model)) {
        diagram.patch(model);
        return;
      }
      diagram.load(model);
      if (fitOnLoad) diagram.zoomToFit();
    }, [diagram, model, fitOnLoad]);

    useEffect(() => {
      if (diagram && mode) diagram.setMode(mode);
    }, [diagram, mode]);

    useEffect(() => {
      if (diagram && theme) diagram.setTheme(theme);
    }, [diagram, theme]);

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
export interface NodeRendererProps {
  node: NodeModel;
  data: DataRecord | undefined;
  status?: string;
  selected: boolean;
  /** The node's ports, resolved for this instance. The library draws them; use them for layout hints. */
  ports: PortDef[];
}

export type NodeRendererEntry =
  | ComponentType<NodeRendererProps>
  | { component: ComponentType<NodeRendererProps>; sizing?: 'fixed' | 'content' };

const isComponent = (e: NodeRendererEntry): e is ComponentType<NodeRendererProps> =>
  typeof e === 'function' || (typeof e === 'object' && e !== null && !('component' in e));
const componentOf = (e: NodeRendererEntry | undefined) =>
  e === undefined ? undefined : isComponent(e) ? e : e.component;

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
