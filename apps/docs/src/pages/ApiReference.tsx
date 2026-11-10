interface Entry {
  sig: string;
  doc: string;
}

const SECTIONS: { title: string; intro?: string; entries: Entry[] }[] = [
  {
    title: 'Diagram',
    intro: 'Framework-agnostic entry point from @vespenelabs/pipeline-view.',
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
        doc: 'Replaces the diagram. Validates ids and link ends; clears undo history. The current model version is 2; version 1 documents are migrated on load (migrateModel), and toJSON() writes version 2.',
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
        doc: 'Whole diagram or current viewport: exportSVG returns a standalone SVG string, exportPNG a Blob.',
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
    title: 'Controlled mode and history',
    intro:
      'For apps that keep the document in their own store. See the Controlled mode with Zustand guide.',
    entries: [
      {
        sig: 'patch(model: DiagramModel, { undoable? }): ModelPatch',
        doc: 'Applies only the difference to a new version of the same document: no reload, no viewport reset; selection, live values and untouched routes survive. Not undoable by default. <PipelineView> calls it when its model prop changes to a version of the same document.',
      },
      {
        sig: 'applyDiff(patch: ModelPatch, { undoable? }): void',
        doc: 'Applies a JSON patch (added / removed / changed per collection) as one transaction.',
      },
      {
        sig: 'isDirty() / markSaved()',
        doc: 'Whether the document (not live values) differs from the last markSaved() or load().',
      },
      {
        sig: 'DiagramOptions.history: false | HistoryAdapter',
        doc: 'Omitted: the diagram keeps its own undo stack. false: no history. An adapter { push, undo, redo, canUndo?, canRedo? }: the host stores the HistoryEntry { forward, inverse } patches; undo()/redo() and Ctrl+Z call it.',
      },
      {
        sig: 'modelChange: { diff, model, patch? }',
        doc: 'patch is the JSON-serializable forward patch of the edit.',
      },
    ],
  },
  {
    title: 'Edit guards and locking',
    entries: [
      {
        sig: 'DiagramOptions.onBeforeDelete(items: { nodes, links, annotations }) => boolean | Promise<boolean>',
        doc: 'Asked before a delete, including links that go with their nodes. Return a Promise to show your own confirmation; the change is rolled back while it is pending and applied when it resolves true, unless the model changed in the meantime.',
      },
      {
        sig: 'DiagramOptions.beforeChange(diff, patch) => boolean | Promise<boolean>',
        doc: 'Veto for any user transaction, with the same Promise behaviour.',
      },
      {
        sig: 'NodeModel.locked / LinkModel.locked',
        doc: 'Locked items cannot be moved, deleted or reconnected in edit mode, and get data-locked. Saved with the model (v2).',
      },
    ],
  },
  {
    title: 'Problem markers',
    intro: 'View state for validation results and save errors: never saved, never exported.',
    entries: [
      {
        sig: 'setIssues({ nodes?, links? }: IssueMap) / getIssues()',
        doc: 'Replaces every marker at once. Issue = { severity: "error" | "warning" | "info", message, code? }. Each marked item gets a badge with a tooltip, data-issue-severity (worst) and the messages as its accessible description.',
      },
      {
        sig: 'nextIssue(direction?: 1 | -1): ItemRef | null',
        doc: 'Selects the next marked item in reading order, scrolls it into view and focuses it. Bound to F8 / Shift+F8.',
      },
      {
        sig: '<PipelineView issues={…}>',
        doc: 'Applies setIssues when the object identity changes.',
      },
    ],
  },
  {
    title: 'Comparing versions',
    entries: [
      {
        sig: 'getDiff(base, current, { ignore? }): ModelComparison',
        doc: 'Lists added, removed, moved (geometry only) and changed items. status is ignored by default. Pure: works on the server.',
      },
      {
        sig: 'showDiff(base | null, { ignore? }) / getDiffBase()',
        doc: 'Marks the canvas: data-diff on added, moved and changed items, outlines around marked nodes, ghosts for removed ones. Follows edits; null clears.',
      },
      { sig: '<PipelineView compareWith={base}>', doc: 'Applies showDiff from React.' },
    ],
  },
  {
    title: 'Testing',
    intro:
      'From @vespenelabs/pipeline-view/testing. Needs a DOM (jsdom or happy-dom). See the Testing guide.',
    entries: [
      {
        sig: 'createTestDiagram(options?): TestDiagram',
        doc: 'Mounted diagram in edit mode with the editor attached; { diagram, container, flush, destroy }.',
      },
      {
        sig: 'connect / drag / drop / click / pressKey',
        doc: 'Actions through real DOM events; each renders before it returns.',
      },
      {
        sig: 'getNodeByLabel / getPort / getNodeElement / getLinkElement / findLinks / expectLink',
        doc: 'Queries and an assertion with readable failure messages.',
      },
      {
        sig: 'data-pv-node-id / data-pv-port-id / data-pv-link-id',
        doc: 'Stable attributes on rendered items, for any test runner.',
      },
    ],
  },
  {
    title: 'Symbols',
    intro: 'From @vespenelabs/pipeline-view and @vespenelabs/pipeline-view/symbols.',
    entries: [
      {
        sig: 'registerSymbol(...defs: SymbolDef[])',
        doc: 'Adds symbols to the global registry. See Custom symbols.',
      },
      {
        sig: 'gasSymbols / processSymbols',
        doc: 'Built-in packs as arrays (50 gas symbols, 4 process symbols).',
      },
      {
        sig: 'registerGasSymbols(registry?) / registerProcessSymbols(registry?)',
        doc: 'Register a pack globally or into a given registry.',
      },
      {
        sig: 'gateValve, ballValve, … pump, tank, conicalTank, controlValve',
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
        The public surface of <code>@vespenelabs/pipeline-view</code> and its subpaths (
        <code>/symbols</code>, <code>/react</code>, <code>/testing</code>). All types ship with the
        package. What counts as public API, and how it changes, is in <code>VERSIONING.md</code>.
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
