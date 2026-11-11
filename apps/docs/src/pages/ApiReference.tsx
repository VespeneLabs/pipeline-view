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
      {
        sig: 'getBounds(): Rect',
        doc: 'Bounding box of all content in diagram coordinates: nodes with their labels (the label box is estimated from its text), annotations, and links by their routed paths once mounted (by their manual waypoints before that). Every fit and the export frame use it, so a label wider than its symbol is never cut off. nodeLabelBox(node, def) returns the estimated label box.',
      },
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
        doc: 'Whole diagram or current viewport: exportSVG returns a standalone SVG string, exportPNG a Blob. Computed styles are copied onto each shape, so host CSS for a custom link kind (.pv-link[data-kind="steam"] .pv-link-line { stroke-dasharray: … }) is kept as long as that stylesheet applies when you export.',
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
        doc: 'Editor validation hooks. Return true, false, or { ok: false, reason, code?, detail? } to explain a refusal. canConnect gets the ends in flow order (outlet → inlet). See Ports and connection rules.',
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
        doc: 'Applies a JSON patch (added / removed / changed per collection) as one transaction. Undoable by default, unlike patch().',
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
        doc: 'Asked before a delete, including links that go with their nodes. Return a Promise to show your own confirmation; the change is rolled back while it is pending and applied when it resolves true, unless the model changed in the meantime (then changeDropped fires instead).',
      },
      {
        sig: 'DiagramOptions.beforeChange(diff, patch) => boolean | Promise<boolean>',
        doc: 'Veto for every update() (programmatic ones too) and every committed editor gesture, with the same Promise behaviour. Host-driven patch(), applyDiff() and history replays skip it.',
      },
      {
        sig: 'LinkModel.label / LinkModel.labelPosition',
        doc: 'Short text on a link, for example a flowchart answer. It follows the route and sits on the middle of the longest segment that keeps it off nodes and off other link labels, with a halo so it stays readable over crossings. When no segment middle is free it slides along its own path to the nearest free spot (or goes beside a segment when the whole route hugs nodes), so labels of links that converge on one target stay apart. labelPosition (0..1) is the preferred spot by fraction of the path length: it is used when free, otherwise the label slides along the path to the nearest free spot. Placement uses estimated boxes (no layout read), does not depend on the order links were added (labels are placed in link id order), and follows reroutes and node moves. The label is part of the link\'s aria-label ("Yes, Leak test to Report leak"), styled through .pv-link-label and --pv-link-label-ink / --pv-link-label-bg, and hidden below the label zoom threshold.',
      },
      {
        sig: 'NodeModel.locked / LinkModel.locked',
        doc: 'Saved with the model (v2), and styled through data-locked. In edit mode a locked node cannot be moved or deleted, and a locked link cannot be deleted or reconnected; deleting a selection skips locked items, and nodes whose removal would take a locked link with them. An update() that would remove a locked link (e.g. by removing its port) throws and rolls back.',
      },
      {
        sig: 'changeDropped: { reason: "stale", diff }',
        doc: 'An async-approved change was not applied because the model changed while the Promise was pending. Also as onChangeDropped on <PipelineView>.',
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
    title: 'Ports and connection rules',
    entries: [
      {
        sig: 'SymbolDef.ports / size: value or (node) => value; NodeModel.ports',
        doc: 'Per-node ports, e.g. a manifold whose inlet count comes from node.data. NodeModel.ports overrides the symbol. Always read them through nodePorts(def, node) / nodeSize(def, node) / findPort(). Change port-driving data with update(): the live path redraws ports but never edits the model, so links on a vanished port stay.',
      },
      {
        sig: 'SymbolDef.uprightText?: boolean',
        doc: 'Text drawn inside a symbol stays upright and unmirrored when the node is rotated or flipped, as node labels do (default true). Each <text> turns back around its own centre and stacked lines turn as one block, so an instrument bubble flipped to put its stem on top still reads "PT" over its loop number. false lets the text turn with the drawing.',
      },
      {
        sig: 'sidePorts(size, side, count, { idPrefix?, start?, labels?, spacing?, role?, maxLinks?, accepts? })',
        doc: 'Evenly spaced ports along one side, with optional index labels.',
      },
      {
        sig: 'withPorts(def, extra): SymbolDef',
        doc: 'A copy of a symbol with extra ports, without restating its own: registerSymbol(withPorts(gateValve, [{ id: "side", position: { x: 20, y: 0 }, direction: "top" }])). Works whether the symbol\'s ports are a list or a function of the node; extra may be a function of the node too. An extra port with an existing id replaces that port.',
      },
      {
        sig: 'PortDef.role: "in" | "out" | "both" · maxLinks · label · accepts',
        doc: 'An inlet can start a drag, but the link is always stored outlet → inlet. maxLinks limits links per port (connected ports get data-occupied). label is drawn unrotated next to the port.',
      },
      {
        sig: 'DiagramOptions.mergeJunctions: boolean',
        doc: 'Whether junction dots are drawn where links merge into one port or fan out of one port (default true). With false, a dot is skipped when every link meeting at that point ends on the same node and port, or every one starts from the same node and port, so several arrows into one flowchart step no longer read as a tee. Links with different ends that share a trunk keep their dot, and line jumps are unaffected.',
      },
      {
        sig: 'DiagramOptions.directed: boolean | { kinds }',
        doc: 'Links of these kinds must run from an out port to an in port; arrows follow.',
      },
      {
        sig: 'refusalMessages(code, ctx) / canConnectOrder: "after-builtins" | "before-builtins"',
        doc: 'Localize built-in refusals (missing-port, same-port, self-loop, kind-not-accepted, direction, port-full, duplicate, max-links-between-nodes, cycle) and your own codes; choose whether your canConnect runs before or after them.',
      },
      {
        sig: 'connectRejected: { from, to, kind, code, reason, detail?, point }',
        doc: 'A connect drop on a port or node was refused. A drop on empty canvas is a cancel and does not fire. While dragging, refusing ports get data-refused with the reason as a tooltip.',
      },
      {
        sig: 'validateConnect(diagram, from, to, kind) / isDirected(diagram, kind)',
        doc: 'The same rule set outside the editor, e.g. for your own forms. Returns { ok: true, from, to } in flow order, or the refusal.',
      },
    ],
  },
  {
    title: 'Graph rules and helpers',
    entries: [
      {
        sig: 'noCycles: boolean | { kinds } · noSelfLoops · maxLinksBetweenNodes',
        doc: 'Whole-graph connection rules (refusal codes cycle, self-loop, max-links-between-nodes; a cycle refusal carries detail.cycleNodes). Cycles follow link direction, so noCycles is most meaningful together with directed.',
      },
      {
        sig: 'upstreamOf / downstreamOf(source, nodeId, { kinds?, through? })',
        doc: 'Nodes reachable against / along the flow. through(node) returning false stops the walk at that node (e.g. a closed valve).',
      },
      {
        sig: 'topologicalOrder / findCycles / connectedComponents / flowPath',
        doc: 'Pure helpers over a DiagramModel or a live Diagram; safe on the server.',
      },
    ],
  },
  {
    title: 'React node renderers',
    intro: 'From @vespenelabs/pipeline-view/react.',
    entries: [
      {
        sig: "<PipelineView nodeRenderers={{ 'app/card': Card }}>",
        doc: 'Renders nodes of a type with your component, inside the node box. Declare the type as a SymbolDef (size and ports, no SVG): the library still draws the ports, routes to them and handles selection. Each node re-renders only when its own data, status or selection changes.',
      },
      {
        sig: 'NodeRendererProps: { node, data, status, selected, ports }',
        doc: 'Props of a node component.',
      },
      {
        sig: "{ component, sizing: 'fixed' | 'content' }",
        doc: "'fixed' (default) fills the declared size. 'content' sizes the node from its rendered content and scales the ports to match (view state, never saved). For cards showing live numbers, give the value a fixed-width slot (tabular-nums, min-width) or use 'fixed', so ticks don't resize the node (a resize that moves a port also re-routes that port's links).",
      },
    ],
  },
  {
    title: 'Viewport',
    entries: [
      {
        sig: "initialViewport · fitOnLoad: 'always' | 'if-no-viewport' | 'never'",
        doc: 'Restore a saved view; by default the diagram fits only when no viewport is given, after HTML/React content has been measured.',
      },
      {
        sig: 'viewportChange: { viewport, final? }',
        doc: 'final is true once a pan, zoom or animation has settled: save the view then, not on every frame.',
      },
      {
        sig: 'lockViewport(locked) / isViewportLocked()',
        doc: 'Stops user pan and zoom (also keyboard zoom); programmatic setViewport still applies. The root gets data-viewport-locked.',
      },
      {
        sig: '<ViewportControls step? reset? lock? labels? inDiagram? />',
        doc: 'Accessible zoom in / out, fit, reset and optional lock buttons, styled by .pv-viewport-controls.',
      },
    ],
  },
  {
    title: 'Annotations: hiding and dragging',
    intro:
      'Display state for annotations (reading cards, text): it lives in the diagram, not in the model, so it never touches undo, isDirty() or toJSON().',
    entries: [
      {
        sig: 'setHiddenAnnotations(ids | predicate | null) / isAnnotationHidden(id)',
        doc: 'Hides annotations and their leaders. Renderers stay mounted, and hidden annotations are left out of fitting. Also as hiddenAnnotations on <PipelineView>.',
      },
      {
        sig: "annotationDrag: false | 'edit' | 'always'",
        doc: "Lets users drag annotations with the pointer (mouse, pen, touch) or, with one focused, the arrow keys (Shift for a bigger step, grid steps when grid.snap is on; Enter commits, Esc reverts). 'edit' allows it in edit mode only, 'always' in view mode too. Anchored annotations stay anchored and their leaders follow. A drag never pans, selects or emits clicks. Inputs inside a card, and anything under [data-pv-no-drag], keep their own gestures. Change it later with setAnnotationDrag(drag, moves?) or the <PipelineView> prop.",
      },
      {
        sig: 'AnnotationModel.draggable?: boolean',
        doc: 'Per-annotation override: true makes it draggable in every mode, false never.',
      },
      {
        sig: "annotationMoves: 'model' | 'display'",
        doc: "'model' (default) commits a finished move as one undoable update(), reported by modelChange with origin 'user'. 'display' keeps it as display state: the host saves it from annotationMove and restores it with setAnnotationPositions().",
      },
      {
        sig: 'annotationMove: { id, position, final }',
        doc: 'Emitted while the user moves an annotation. position is in the space of AnnotationModel.position (relative to the anchor node when anchored). final is true once, when the move ends: save then. Also as onAnnotationMove on <PipelineView>.',
      },
      {
        sig: 'annotationName(annotation, anchor) => string | undefined',
        doc: "The accessible name of a draggable annotation: its aria-label and the name in move announcements. Return undefined for the default (a text annotation's text, else the anchor node's label, else the annotation id), for example when the label lives in the node's data. The name follows the annotation and its anchor, live data included; call refreshAnnotationNames() when anything else it reads changes (a locale). Also a <PipelineView> prop that can change at any time.",
      },
      {
        sig: 'annotationMessages: { moved?(name, position, final), cancelled?(name) }',
        doc: 'Phrases or localizes what a move announces through the live region. moved with final: false is one keyboard step (default: the rounded position, "12, -80"); with final: true it is a finished pointer or keyboard move (default: "Moved {name}."). cancelled covers Escape, a cancelled pointer and a vetoed commit (default: "Move cancelled. {name}."). Return undefined to keep a default, or an empty string to say nothing. Also a <PipelineView> prop.',
      },
      {
        sig: 'setAnnotationPositions(Record<id, Point> | null) / getAnnotationPosition(id)',
        doc: 'Display positions that override the model position. Passing a new record replaces the previous one, so leaving an id out (or passing null) puts annotations back on their model position. getAnnotationPosition returns the effective position; placement, leaders, itemBounds() and getBounds() all use it.',
      },
    ],
  },
  {
    title: 'Placing, dropping and connecting',
    entries: [
      {
        sig: 'acceptDrop({ mimeType, toNode(dataTransfer, point) }): () => void',
        doc: 'HTML5 drag and drop from your own elements (edit mode). toNode builds the node at the drop point (diagram coordinates) or returns null; canDrop checks it, the position snaps to the grid when grid.snap is on, and a taken id gets a _N suffix. Returns an unsubscribe.',
      },
      {
        sig: 'startPlacement(type, init?)',
        doc: 'Placement mode for keyboard and touch: a preview follows the pointer (starting at the centre of the view); canDrop marks a refused spot with its reason; click, tap-lift or Enter places it, arrow keys nudge it (Shift for bigger steps), Esc cancels. Needs a mounted diagram in edit mode, and warns once otherwise.',
      },
      {
        sig: 'connect(from, to, kind?): { ok: true, id } | { ok: false, code, reason, detail?, from, to, dragFrom?, dragTo? }',
        doc: 'Connects two ports from code, with every rule applied, as one undo step; the link is stored in flow order. No mount needed. A refusal carries the ends in flow order (outlet → inlet) as from / to, plus dragFrom / dragTo when they were passed the other way round.',
      },
      {
        sig: 'Keyboard: C on the selected node',
        doc: 'Connect without a mouse: pick a source port with the arrow keys or Tab and Enter, then a compatible target (nearest first) and Enter. Esc steps back, then cancels. Every step, result and refusal (pointer refusals too) is announced in a polite live region.',
      },
    ],
  },
  {
    title: 'Routing worker',
    entries: [
      {
        sig: 'routingWorker: boolean | { createWorker? }',
        doc: 'Routes the initial full pass off the main thread for diagrams with at least culling.threshold links. Links show as straight placeholders until the routes arrive; incremental re-routes during edits stay on the main thread.',
      },
      {
        sig: '@vespenelabs/pipeline-view/routing-worker',
        doc: "The worker entry, for bundlers that need their own worker import, e.g. Vite: import W from '@vespenelabs/pipeline-view/routing-worker?worker' and pass { createWorker: () => new W() }. By default it loads with new URL('./routing.worker.js', import.meta.url).",
      },
      {
        sig: 'createRoutingWorker({ createWorker? }) → { routeAll, terminate }',
        doc: 'The worker client for hosts that route outside a Diagram; a newer job aborts the previous one (AbortError).',
      },
    ],
  },
  {
    title: 'Large diagrams',
    entries: [
      {
        sig: 'culling: boolean | { threshold?: 300, margin?: 200 }',
        doc: 'At or above the node count, items outside the visible area (plus a screen-pixel margin) are not rendered, and their data ticks wait until they are visible. On by default.',
      },
      {
        sig: 'lod: false | { labels?: 0.4, overlays?: 0.35, ports?: 0.5 }',
        doc: 'Below these zoom levels, labels, overlay cards and port dots are hidden (root classes pv-lod-labels / -overlays / -ports). On by default only while culling is active; passing an lod object turns it on regardless. View-only: the model and exports are unaffected.',
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
        doc: 'Built-in packs as arrays (50 gas symbols, 9 process symbols).',
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
