import {
  Diagram,
  attachEditor,
  type DiagramEvents,
  type DiagramMode,
  type DiagramModel,
  type DiagramOptions,
  type EditorControllerOptions,
  type HtmlRenderer,
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
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { PortalStore, type PortalEntry, type ReactRenderer } from './portals';

export const DiagramContext = createContext<Diagram | null>(null);

type Handler<K extends keyof DiagramEvents> = (payload: DiagramEvents[K]) => void;

export interface PipelineViewProps {
  /**
   * The model to show. It's loaded whenever its identity changes, except when it's the exact object this
   * view last reported through onModelChange, so controlled usage doesn't reload on every edit.
   */
  model?: DiagramModel;
  mode?: DiagramMode;
  theme?: ThemeName;
  /** Instance-local symbols, added to the global registry. */
  symbols?: SymbolDef[];
  /** React overlay renderers, referenced by HtmlAnnotation.renderer or a node's data.overlay. */
  renderers?: Record<string, ReactRenderer>;
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
      const d = new Diagram({
        ...p.options,
        mode: p.mode,
        theme: p.theme,
        symbols: p.symbols,
        htmlRenderers,
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

    const { model, mode, theme, symbols, fitOnLoad = true } = props;

    useEffect(() => {
      if (!diagram || !model || model === loaded.current || model === lastEmitted.current) return;
      loaded.current = model;
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
        {entries.map((e) => (
          <PortalSlot key={e.key} entry={e} render={props.renderers?.[e.name]} />
        ))}
        {props.children}
      </DiagramContext.Provider>
    );
  },
);

const NO_ENTRIES: PortalEntry[] = [];
const serverSnapshot = () => NO_ENTRIES;

/** One overlay slot. Memoized on the entry object, which changes only when that slot's item changes. */
const PortalSlot = memo(function PortalSlot({
  entry,
  render,
}: {
  entry: PortalEntry;
  render: ReactRenderer | undefined;
}) {
  return render ? createPortal(render(entry.item), entry.el) : null;
});

/** The Diagram of the nearest <PipelineView>, or null before it mounts. */
export function useDiagram(): Diagram | null {
  return useContext(DiagramContext);
}
