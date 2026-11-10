interface Entry {
  sig: string;
  doc: string;
}

const SECTIONS: { title: string; intro?: string; entries: Entry[] }[] = [
  {
    title: 'Diagram',
    intro: 'Framework-agnostic entry point from @pipeline-view/core.',
    entries: [
      {
        sig: 'new Diagram(options?: DiagramOptions)',
        doc: 'Creates a diagram. Safe to call during SSR; nothing touches the DOM until mount().',
      },
      {
        sig: 'mount(container: HTMLElement): void',
        doc: 'Attaches the SVG layer and the HTML overlay to the container.',
      },
      { sig: 'destroy(): void', doc: 'Removes DOM, listeners and timers.' },
    ],
  },
  {
    title: 'Model',
    entries: [
      {
        sig: 'load(model: DiagramModel): void',
        doc: 'Replaces the diagram. Validates ids and link ends; clears undo history.',
      },
      {
        sig: 'toJSON(): DiagramModel',
        doc: 'Serializable model. load(toJSON()) round-trips without loss.',
      },
      {
        sig: 'update(fn: (tx: Transaction) => void, opts?: { undoable?: boolean }): void',
        doc: 'Transactional edit: one render, one undo step, emits modelChange with a diff, may re-route.',
      },
      { sig: 'undo() / redo() / canUndo() / canRedo()', doc: 'Undo history of update() calls.' },
      {
        sig: 'preview(fn) / commitPreview() / cancelPreview()',
        doc: 'Live gesture edits (drags) that become exactly one undo step on commit, or vanish on cancel.',
      },
    ],
  },
  {
    title: 'Live data',
    intro:
      'The high-frequency path. Never creates undo entries, never re-routes, never emits modelChange.',
    entries: [
      {
        sig: 'setNodeData(id: string, patch: DataRecord, status?: string): void',
        doc: 'Merges data into one node and refreshes its bindings and overlay on the next frame.',
      },
      {
        sig: 'setNodeDataBatch(updates: Record<string, { data?: DataRecord; status?: string }>): void',
        doc: 'Many nodes at once; use it once per data tick.',
      },
    ],
  },
  {
    title: 'View',
    entries: [
      {
        sig: 'getMode() / setMode(mode: "view" | "edit")',
        doc: 'Viewer (read-only layout) or editor.',
      },
      { sig: 'setTheme(theme: "light" | "dark" | "auto")', doc: 'Overrides prefers-color-scheme.' },
      { sig: 'getViewport() / setViewport(v, { animate? })', doc: 'Pan (screen px) and zoom.' },
      {
        sig: 'zoomToFit({ padding?, animate? }) / zoomToItem(item, { animate? })',
        doc: 'Frames the whole diagram or one item.',
      },
      { sig: 'screenToDiagram(p) / diagramToScreen(p)', doc: 'Coordinate conversion.' },
      { sig: 'getBounds(): Rect', doc: 'Bounding box of all content in diagram coordinates.' },
      {
        sig: 'getSelection() / setSelection(items: ItemRef[])',
        doc: 'Current selection; emits selectionChange. In view mode a click selects.',
      },
      {
        sig: 'getLinkPath(linkId): Point[] | undefined',
        doc: 'The routed polyline of a link, ports included.',
      },
      {
        sig: 'exportSVG(opts?) / exportPNG(opts?)',
        doc: 'Whole diagram or current viewport. Coming in v1 (in review).',
      },
    ],
  },
  {
    title: 'Events',
    intro: 'diagram.on(event, handler) returns an unsubscribe function.',
    entries: [
      {
        sig: 'nodeClick / nodeDoubleClick / linkClick',
        doc: '{ item, point, originalEvent }. Commands to equipment start here; the host decides what to do.',
      },
      { sig: 'contextMenu', doc: 'Right-click on an item or on empty canvas (item: null).' },
      { sig: 'hover', doc: '{ item | null, point } for host-provided tooltips.' },
      { sig: 'selectionChange', doc: '{ selection: ItemRef[] }' },
      { sig: 'modelChange', doc: '{ diff, model } after transactional edits only.' },
      { sig: 'viewportChange', doc: '{ viewport }' },
    ],
  },
  {
    title: 'DiagramOptions',
    entries: [
      { sig: 'mode, theme, ariaLabel', doc: 'Initial mode, theme and accessible name.' },
      {
        sig: 'symbols: SymbolDef[]',
        doc: 'Instance-local symbols layered over the global registry.',
      },
      {
        sig: 'htmlRenderers: Record<string, HtmlRenderer>',
        doc: 'Renderers for HTML annotations and node overlays (data.overlay). Called again with the same element on every data or status change, so they must be idempotent; only the first returned cleanup is kept. Anchored annotations receive { ...node.data, ...annotation.data } and fall back to the node status.',
      },
      {
        sig: 'grid: { size, snap, visible }',
        doc: 'Editor grid; visible draws it with --pv-grid.',
      },
      { sig: 'minZoom, maxZoom', doc: 'Zoom limits.' },
      { sig: 'routing: { clearance?, spacing?, bendPenalty? }', doc: 'Orthogonal router tuning.' },
      {
        sig: 'canConnect(from, to, kind) / canDrop(type, position)',
        doc: 'Editor validation hooks.',
      },
    ],
  },
  {
    title: 'Symbols',
    intro: 'From @pipeline-view/core and @pipeline-view/symbols.',
    entries: [
      {
        sig: 'registerSymbol(...defs: SymbolDef[])',
        doc: 'Adds symbols to the global registry. See Custom symbols.',
      },
      {
        sig: 'gasSymbols / processSymbols',
        doc: 'Built-in packs as arrays (50 gas symbols, 3 process symbols).',
      },
      {
        sig: 'registerGasSymbols(registry?) / registerProcessSymbols(registry?)',
        doc: 'Register a pack globally or into a given registry.',
      },
      {
        sig: 'gateValve, ballValve, … pump, tank, controlValve',
        doc: 'Individual symbol exports; importing one only bundles that one.',
      },
      {
        sig: 'ValveData, InstrumentData, PumpData, TankData',
        doc: 'Shapes of the data each symbol binds: open, letters/loop, running, level.',
      },
    ],
  },
];

export function ApiReference() {
  return (
    <article className="prose">
      <h1>API reference</h1>
      <p className="lede">
        The public surface of <code>@pipeline-view/core</code> and{' '}
        <code>@pipeline-view/symbols</code>. All types ship with the packages.
      </p>
      {SECTIONS.map((s) => (
        <section key={s.title}>
          <h2>{s.title}</h2>
          {s.intro && <p>{s.intro}</p>}
          <dl className="api-list">
            {s.entries.map((e) => (
              <div key={e.sig}>
                <dt>
                  <code>{e.sig}</code>
                </dt>
                <dd>{e.doc}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </article>
  );
}
