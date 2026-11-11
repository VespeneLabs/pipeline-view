# @vespenelabs/pipeline-view

## 1.12.0

### Minor Changes

- f08e813: `getBounds()` now includes node labels and routed link paths, so `zoomToFit()`, the fit on load and the export frame no longer cut off a label that is wider than its symbol at the edge of a drawing, or a pipe that runs around the outside. Label boxes are estimated from the text (the same estimate that routing around labels uses); `nodeLabelBox(node, def)` and `nodeLabelAnchor(node, def)` are exported. Links count with their routed paths once the diagram is mounted and with their manual waypoints before that. Fits of drawings with wide edge labels come out slightly smaller than before.
- 4488c02: Editing for link ends attached to another link.
  
  `linkAttach: true` lets the user draw a connection onto a link in edit mode. Dropping a connection on a link creates a link whose end is attached where it was dropped; the landing point is marked while dragging, and a port or node body under the pointer still wins. Keyboard connect (`C`) lists links after ports and attaches at the middle of the chosen link. A drag from an inlet gives a link that flows out of the host link (`fromAttach`, with `from` taken from the host link); any other port gives one that flows into it (`toAttach`, with `to` taken from the host link).
  
  `resolveAttach(proposal)` sees the link before it is validated and may return a changed proposal (other ends, such as a dedicated side port on the same node, or another `at`), `null` to not offer an attachment on that link, or nothing to keep it. The usual connection rules then run on the result, and `canConnect` gets a fourth argument, `ctx.attach = { end, link, at }`. An attached end doesn't land on its port, so it is exempt from the port's `maxLinks` and is not counted against it later; a locked or missing host link refuses with `attach-locked` / `attach-missing-link`.
  
  A selected link with an attached end shows a round handle on it (`.pv-attach-handle`). Dragging the handle, or pressing the arrow keys (Shift for a grid step), slides the end along the host link. Each move is one undo step, arrives in `modelChange.patch` as a changed link and is announced to screen readers; `attachMessages.moved` phrases or localizes the announcement.
  
  `diagram.connect(from, to, kind, { fromAttach?, toAttach? })` creates an attached link from code, and `validateConnect` takes the same attachments as a sixth argument.
- 6036f80: A link end can be drawn on another link: `LinkModel.fromAttach` / `toAttach: { link, at }`, where `link` is the host link's id and `at` is the place along its route as a fraction of its length (0 = start, 1 = end). This lets a side connection join a pipe at a point, or lines branch without a header symbol.
  
  The attachment only changes the drawing. `from` / `to` still name the node and port the link logically runs to, so graph helpers, connection rules and the topology part of `getDiff` are unaffected. The end follows the host link when it re-routes, leaves it at a right angle and gets a junction dot (also with `mergeJunctions: false`), and the link gets `data-attached`. A link can be attached to an attached link. Deleting the host link removes the attachment from the links on it in the same undo step; an attachment to a missing link, or one that closes a loop, is ignored and the end is drawn on its port. `getDiff` counts attaching, detaching and moving along the host as `moved`.
  
  `pointAlong(route, at)` and `fractionAlong(route, point)` convert between fractions and points of a route, and `attachCycle(links, id, host)` tells whether an attachment would close a loop. The model stays at version 2.
- f08e813: The off-page connectors (`process/off-page-inlet`, `process/off-page-outlet`) grow with their tag: `data.text` longer than about 7 characters widens the symbol instead of overflowing it. Short tags keep the 96 px shape. On the inlet the port sits on the tip, so it moves right with the extra width; the node's top-left corner stays where it is.
- 371d23b: Text drawn inside a symbol now stays upright and unmirrored when the node is rotated or flipped, the way node labels already do. This covers every `<text>` in a symbol's `svg` or `render` output, in the built-in packs and in host symbols: each text turns back around its own centre, and stacked lines (the tag letters and loop number of an instrument bubble) turn as one block, so they keep their place in the shape and their order. A bubble flipped to put its stem on top reads "PT", not its mirror image. Exports and the ghosts of removed nodes in a comparison follow.
  
  Set `uprightText: false` on a `SymbolDef` when the text is part of the drawing and must turn with it. Note that under a quarter turn the text keeps its horizontal reading direction, so a long string in a narrow symbol can reach outside the shape.
- f08e813: `withPorts(def, extra)` returns a copy of a symbol with extra ports, so a host can add a side port to an existing symbol without restating its ports: `registerSymbol(withPorts(gateValve, [{ id: 'side', position: { x: 20, y: 0 }, direction: 'top' }]))`. It works whether the symbol's ports are a list or a function of the node, `extra` may be a function of the node too, and an extra port with an existing id replaces that port.

## 1.11.0

### Minor Changes

- a11282e: Accessible names and announcements for draggable annotations are now the host's to shape. `annotationName(annotation, anchor)` sets a draggable annotation's `aria-label` and the name used in move announcements, for hosts whose labels live in node data. Without it (or when it returns undefined) the name is the text annotation's text, then the anchor node's label, then the annotation id; an unlabelled anchor's internal id is no longer read out. Names update in place when the annotation or its anchor changes (live data included), and `diagram.refreshAnnotationNames()` re-reads them when something else changed, such as the locale.
  
  `annotationMessages: { moved?(name, position, final), cancelled?(name) }` phrases or localizes the announcements. The default for a finished move is now "Moved {name}." without coordinates, pointer drags are announced too, and each keyboard step announces the rounded position. A cancelled move, or a commit vetoed by `beforeChange`, says "Move cancelled. {name}.".
  
  `<PipelineView>` takes `annotationName` and `annotationMessages` as props that can change at any time.

## 1.10.0

### Model

- `AnnotationModel.draggable` is new (optional): `true` makes one annotation draggable in every mode, `false` never. The model version stays 2.

### Minor Changes

- fa4f83a: Draggable annotations: `annotationDrag: 'edit' | 'always'` (default off) lets users move reading cards and text annotations with the pointer (mouse, pen, touch) or the arrow keys, in view mode as well as edit mode. Leaders follow live, anchored annotations stay relative to their node, and a drag never pans, selects or emits clicks.
  
  The host decides where positions live with `annotationMoves`. `'model'` (the default) commits a finished move as one undoable `update()`. `'display'` keeps it as display state, like hidden annotations: no model change, undo step or dirty flag, and nothing in `toJSON()`. The new `annotationMove { id, position, final }` event (`onAnnotationMove` on `<PipelineView>`) reports every move; save the position when `final` is true and restore it with `diagram.setAnnotationPositions(record | null)`. `diagram.getAnnotationPosition(id)` returns the effective position, which placement, leaders, `itemBounds()` and `getBounds()` now use.
  
  Draggable annotations are focusable and named, a keyboard move is announced through the live region, and `<PipelineView>` gets `annotationDrag`, `annotationMoves` and `onAnnotationMove` props (changeable at any time; `diagram.setAnnotationDrag()` in vanilla). React cards stay mounted during and after a drag. Draggable slots carry `data-draggable` (and `data-dragging` while dragged) for styling; content under `[data-pv-no-drag]` doesn't start a drag.
  
- 1ee15e9: Hide annotations as display state: `diagram.setHiddenAnnotations(ids | predicate | null)`, or `<PipelineView hiddenAnnotations>`. Hidden cards, text annotations and their leaders disappear, but the model, undo history, dirty state and routing are untouched, and hidden annotations are left out of fitting. Renderers stay mounted while hidden, so React state survives a toggle. `diagram.isAnnotationHidden(id)` reports the state, and hidden slots get `data-hidden`.
- 4162033: Link labels now avoid each other as well as nodes. Where several labelled links converge in one corridor (for example just above a shared target in a flowchart), each label slides along its own path to the nearest free spot instead of stacking on the others. Placement uses the estimated boxes (no layout read), is deterministic and independent of the order links were added (labels are placed in link id order), and is incremental: a reroute or a node move re-places only the labels near it.
  
  `labelPosition` is now a preference. The label sits exactly there when the spot is free, as before. When the spot is covered by a node or by another label, it slides along the path to the nearest free spot; before, it stayed put and overlapped. For example `labelPosition: 0` now puts the label just clear of the source node instead of on top of its port.
- f4e95de: New `DiagramOptions.mergeJunctions` (default `true`, so nothing changes). With `false`, no junction dot is drawn where every link meeting at a point ends on the same node and port, or every one starts from the same node and port. Several arrows into one flowchart step then no longer read as a tee. Links with different ends that share a trunk keep their dot, and line jumps are unaffected.

## 1.9.0

### Minor Changes

- b070ef7: Renderer data is typed. `ReactRenderer<D>` / `OverlayItem<D>`, `NodeRendererProps<D>` / `NodeRendererEntry<D>` and core's `HtmlRenderer<D>` take the data type, so `item.data`, `props.data` and `props.node` are typed without casts. Typed renderers go straight into `renderers`, `nodeRenderers` and `htmlRenderers`, and one map can mix renderers typed for different data. Every type parameter defaults to `DataRecord`, so existing code compiles unchanged.

## 1.8.0

### Minor Changes

- b5b6cfc: Links now route around node labels as well as node bodies, so a trunk no longer runs straight through the text under a symbol (for example in a column of labelled instruments). The label's box is estimated from its text, so there's no layout read, and pipes keep a small margin from it. It follows label edits and node moves, and works with the routing worker. A node's own pipe that leaves from directly under its label can still cross it. Set `routeAroundLabels: false` to route as before.

## 1.7.0

### Minor Changes

- c0e888e: `<PipelineView modelUpdates="undoable">` makes host edits undoable. Each new version of the same document that comes in through the `model` prop, for example from an inspector or side panel editing the host store, becomes one undo step, like a canvas edit. Undo and redo report `origin: 'history'` through `onModelChange`, so the store follows. The default `'host'` keeps the current behavior: patches stay outside the undo history. Loading a different document still starts a fresh history. Before this, hosts called `diagram.patch(model, { undoable: true })` themselves before rendering.

### Patch Changes

- bb19f94: Lane ordering now handles fans that turn both ways. In 1.5.0 a header whose outlets fan out up and down could still put two links on one vertical run, drawn with junction dots as if they were a tee, and its downward bundle could cross itself. Parallel segments of different links now form a bundle whenever their spans overlap with no node between them, even when they started on different lanes. Each bundle gets the order with the fewest crossings: its own lanes, or lanes packed against either side within how far each segment can move. Members never share a lane on overlapping spans, and crossings with other links nearby count too. On the reported 8-outlet header drawing, crossings and junction dots drop from 4 and 4 to 0.

## 1.6.0

### Model

- Links can carry the optional `label` and `labelPosition`. The model version stays 2.

### Minor Changes

- f8fb7a3: Links can carry a text label: `{ ..., label: 'Leak found' }`, for example the answers on a flowchart's arrows. The label follows the route and sits on the middle of the longest segment whose label box stays off nodes. When the route hugs nodes, it moves beside the line instead. A halo in the background color keeps it readable over crossings and line jumps. `labelPosition` (0..1) places it by fraction of the path length instead. The label becomes part of the link's `aria-label` ("Yes, Leak test to Report leak"). It's themed through `.pv-link-label` and the new `--pv-link-label-ink` / `--pv-link-label-bg` tokens, and it's hidden below the label zoom threshold like node labels.
  
## 1.5.0

### Model

- HTML annotations can carry the optional `sizing: 'fixed' | 'content'`. The model version stays 2, since omitting the field keeps the 1.4 behavior and older readers ignore it.

### Minor Changes

- 59ec57d: HTML annotations can size themselves to their content: `{ kind: 'html', sizing: 'content' }`. The box grows to fit what the renderer draws, with `size` as the minimum, and its leader and bounds follow as the content resizes (live readings, late-loading React content). The default stays `'fixed'`, where the box is exactly `size` and content that doesn't fit overflows it.
  
- 25a316f: `<PipelineView ariaLabel>` sets the diagram's accessible name and can change at any time. `options.ariaLabel` is read only once, at creation. The new `diagram.setAriaLabel(label)` does the same thing in core.
- 7cbbe79: Fitting can keep large drawings legible. `zoomToFit({ minZoom })`, and the new `fitMinZoom` option for fit-on-load and the fit button, set a floor for the fit zoom. When the whole diagram can't fit at that zoom, the view shows its top-left part and the user can pan to the rest. Manual zoom-out is still limited only by `minZoom`. Any fit whose content overflows (including at `minZoom`) now aligns to the top/left edge instead of centering, which used to cut off both ends.
- 42b2ebf: Port labels can be kept off the pipe. `PortDef.labelPlacement` is one of:
  
  - `'inside'`: the default, unchanged.
  - `'above'`: inside the symbol, lifted off the stub.
  - `'outside'`: beyond the port, lifted off the line.
  
  `PortDef.labelOffset` nudges the label in diagram units. Placement follows rotation, but the text never rotates. Before this, a manifold's index numbers sat on the pipe stubs and looked struck through.
- 4100fe9: Five new industry-neutral process symbols (`registerProcessSymbols()`):
  
  - `process/off-page-inlet` / `process/off-page-outlet`: where a line enters from or leaves to another drawing or a utility. The tag (`"GAS"`, `"N2"`, a drawing ref) comes from `data.text`.
  - `process/inline-instrument`: the pipe runs through, with an ISA bubble on a short tap above. Letters and loop come from data, and `data.flowElement: true` adds flow-element bars. It has `in`/`out` pipe ports plus a `signal` port.
  - `process/header`: a header/manifold with `data.inlets` / `data.outlets` (1–32) indexed ports, growing with the count.
  - `process/burner`: a consumer / burner with one inlet.
  
  The gas pack stays the 50 numbered reference symbols.
- 677a43f: `SymbolDef<D>`'s `size` and `ports` callbacks now receive `NodeModel<D>`, so `node.data` is typed without a cast. A `SymbolDef<D>` can also go into a `SymbolDef[]` or `registerSymbol()` without a cast. All three callbacks (`size`, `ports`, `render`) are now checked bivariantly, the way methods are. Existing code compiles unchanged, but casts like `node.data as MyData` are now unnecessary.

### Patch Changes

- 0737521: `process/header` draws its port index numbers just outside the body, above the pipe, instead of on the pipe stubs.
- 420b61e: Parallel links that share a corridor now get nested lanes instead of reversed ones. Before, a stack of manifold outputs turning the same way gave the topmost output the outermost lane, so every pipe crossed the ones below it and got line jumps. After lanes are spread, the router now swaps lanes within each bundle while that reduces crossings, keeping every obstacle and lane rule. On the reported 8-output scene the crossings drop from 12 to 0, at the default spacing and at spacing 14.

## 1.4.0

### Minor Changes

- fd2336e: `ConnectResult`'s refusal now declares what `diagram.connect()` already returned at runtime: `from` / `to` in flow order (outlet → inlet), and `dragFrom` / `dragTo` when the arguments were passed in the other order. TypeScript hosts can read them without a cast. They share the new exported `RefusalEnds` type with the `connectRejected` event and `RefusalContext`, so the three can't drift apart. Additive: existing code compiles unchanged.
- 9c9b612: Connect from the keyboard (FR-54). With one node selected in edit mode, press C. Choose a source port with the arrow keys or Tab, press Enter, then cycle the compatible target ports (nearest first) and press Enter to connect. Escape steps back, then cancels. A polite live region announces every step, the result and refusal reasons, including `connectRejected` from pointer drops.
  
  Also: host drops (`acceptDrop`) snap to the grid when `grid.snap` is on, like palette drops; `startPlacement()` warns once when no editor is attached instead of doing nothing silently; and the keyboard-connect cursor reveals a culled node. The keyboard flow also cancels, with an announcement, when a new diagram loads or the source node is removed; a full source port is explained ('already has the maximum number of links'); and C without exactly one selected node announces 'Select one node to connect from.'

## 1.3.0

### Minor Changes

- 04c8a30: `<PipelineView documentKey>`: identify the document being shown, for example a saved diagram's id. When the key changes, the new `model` is loaded from scratch (fit on load, cleared selection, fresh undo history and dirty baseline). While it stays the same, model updates are patched in. Without `documentKey`, shared node/link ids are still the heuristic, which misfires when documents reuse ids (`n1`, `n2`, …), so set the key whenever your app switches documents.
- 985e2f8: Drag from your own palette, and connect by command (FR-50, FR-54). `diagram.acceptDrop({ mimeType, toNode })` accepts HTML5 drops from any host element: `toNode(dataTransfer, point)` builds the node, `canDrop` checks it, and a taken id gets a `_N` suffix. `diagram.startPlacement(type, init)` starts placement mode: a preview starts at the centre of the view and follows the pointer, `canDrop` marks a refused spot (`data-refused` plus the reason), a click places it (touch: where the finger lifts), arrow keys nudge it, Enter places and Esc cancels. Panning is paused for touch while placing. `diagram.connect(from, to, kind)` applies every rule headlessly and returns `{ ok: true, id }` or `{ ok: false, code, reason, detail }`.
- 6ecdb49: Whole-graph rules and graph helpers (FR-49). `noCycles` (all kinds, or `{ kinds }`) refuses a link that would close a loop, with code `cycle` and `detail.cycleNodes`. `maxLinksBetweenNodes` limits links between two nodes through any ports (code `max-links-between-nodes`). New pure helpers that work on a saved model or a live diagram: `upstreamOf` / `downstreamOf` (with `kinds` and a `through(node)` stop condition), `topologicalOrder`, `findCycles`, `connectedComponents` and `flowPath`. `validateConnect` and `isDirected` are exported for host forms.
- 9dee451: `modelChange` now carries `origin`: `'user'` for `update()` and editor gestures, `'host'` for `patch()` / `applyDiff()`, and `'history'` for undo/redo (built-in or a `HistoryAdapter`). Hosts in controlled mode can tell their own changes apart from the user's.
  
  - **Behaviour change for `<PipelineView>` users:** it no longer echoes the host's own model updates (a new `model` prop applied with `patch()`) through `onModelChange`, so a store doesn't record each of its own edits twice. If you relied on that echo (for example, to autosave on every change), pass `emitHostChanges` to get those events again, and use `origin` (`'host'`) to tell them apart from user edits.
- 22e914a: Refusals are now always in flow order. `refusalMessages(code, ctx)`, `connectRejected` and the `from` / `to` returned with a refusal describe the link outlet → inlet, however the user dragged it. Before, built-in refusals used the drag order, so a drag from an inlet swapped the names in host messages. When the drag order differs, it's available as `dragFrom` / `dragTo` (additive fields). The `validateConnect` docs now spell out the check order: `maxLinksBetweenNodes` counts both directions and runs before the cycle check.
- 467e8a0: `routingWorker: true` (or `{ createWorker }` for a bundler-specific worker import) routes the initial full pass of large diagrams (at least `culling.threshold` links) in a Web Worker (FR-55). Links show as straight placeholders until the routes arrive, and edits made meanwhile keep their main-thread routes. A newer load drops a stale result, a worker failure falls back to main-thread routing, and incremental re-routes stay on the main thread.
- 7180ea7: Routing in a Web Worker (FR-55). `createRoutingWorker({ createWorker? })` returns `{ routeAll(obstacles, requests, options), terminate() }`. It routes a full pass off the main thread with the same results as a main-thread pass, and a newer job aborts the previous one (`AbortError`). `Router.adoptRoutes(requests, results)` (an additive, optional contract method) lets the main-thread router take over those routes, so later incremental updates behave as if it had routed them itself. The worker ships next to the code that loads it, plus a `@vespenelabs/pipeline-view/routing-worker` subpath for bundlers that need their own worker import. Nothing is created at import time, so it's SSR-safe.

### Patch Changes

- c5d7e41: A content-sized node whose size changes on a data tick no longer re-routes its links unless its ports actually move, or the resized node now comes within the routing clearance (`routing.clearance`, default 12) of a link's path. Live values in content-sized cards no longer cost a re-route per tick.

## 1.2.0

### Model

- The saved model is now **version 2**. It adds the optional `NodeModel.ports`, `NodeModel.locked` and `LinkModel.locked`. v1 documents still load (they're migrated on load, see `migrateModel`); `toJSON()` writes version 2.

### Minor Changes

- 3f9b365: New `changeDropped { reason: 'stale', diff }` event (and the `onChangeDropped` prop on `<PipelineView>`): it tells the host when a change approved by an async `onBeforeDelete` / `beforeChange` wasn't applied, because the model changed while the Promise was pending.
- 74217ef: Comparing two versions (FR-51):
  
  - `getDiff(base, current, { ignore })` lists how two models differ, node by node and link by link:
    - `added` or `removed`;
    - `moved`: only geometry changed (position, rotation, flips; for links, waypoints or routing);
    - `changed`: anything else changed.
  
    `status` is ignored by default, because it is live state. The function is pure and safe on the server.
  - `diagram.showDiff(base)` marks the canvas:
    - `data-diff` on added, moved and changed nodes and links;
    - a dashed outline around marked nodes;
    - removed nodes and links drawn as faded ghosts from the base geometry.
  
    The marks follow edits. `showDiff(null)` clears them, and `getDiffBase()` reads the current base. Marks are never saved or exported.
  - `<PipelineView compareWith={base}>` does the same from React.
  - New theme tokens: `--pv-diff-added`, `--pv-diff-removed`, `--pv-diff-moved`, `--pv-diff-changed` and `--pv-diff-ghost-opacity`.
- 2940ac7: Shared contract for v1.2 (PRD §11, FR-40..55). New: `PortDef.role` / `maxLinks`; `SymbolDef.ports` and `size` can be functions of the node, and `NodeModel.ports` overrides them (read them through `nodePorts()` / `nodeSize()`); `ValidationResult` (`true | false | { ok: false, reason, code? }`) for `canConnect` / `canDrop`; the `connectRejected` event (and an `onConnectRejected` prop); `viewportChange.final`; `modelChange.patch`; and option and method types for history adapters, delete/change hooks, viewport persistence, issues, graph rules, drop sources, comparisons and large-diagram tuning. These land feature by feature.
  
- ec27384: Controlled mode (FR-44), for apps that keep the document in their own store:
  
  - `diagram.patch(model)` applies only the difference to the current model, with no reload, no re-route of untouched links and no viewport reset. Selection and live values written by `setNodeData` survive. It isn't undoable by default.
  - `diagram.applyDiff(patch)` applies a JSON `ModelPatch` as one transaction, and every `modelChange` now carries the `patch` of the change.
  - The `history` option: `false` turns undo off (the host owns it), or a `{ push, undo, redo }` adapter stores `{ forward, inverse }` patches in the host's history.
  - `isDirty()` / `markSaved()` track unsaved changes and ignore live values.
  - `<PipelineView model>` now patches a new version of the same document instead of reloading it. A model sharing no node or link ids with the current one is still loaded from scratch.
- 0060351: Hooks before delete and before change, and locking (FR-43):
  
  - `onBeforeDelete(items)` is asked before any change that removes items. `items` lists nodes, links and annotations, including the links removed along with a node. Return false, or a Promise of false, to keep them; a host can show its own confirmation dialog. A pending Promise rolls the change back right away, and it's re-applied (as one undo step) only if the Promise resolves true.
  - `beforeChange(diff, patch)` can veto any transaction or committed gesture in the same way. Host-driven `applyDiff` / `patch()` and history replays aren't vetoed.
  - `node.locked` / `link.locked` items can't be moved, rotated, flipped, deleted or re-routed in edit mode, and a node whose deletion would cascade a locked link stays too. Locked items get a `data-locked` attribute.
- 7c7534e: Large diagrams (FR-55):
  
  - **Culling:** above `culling.threshold` nodes (default 300), nodes, links and HTML/React overlay slots outside the visible area plus `culling.margin` screen pixels (default 200) are hidden. Data ticks for hidden nodes are deferred and applied when they scroll back into view. `culling: false` turns it off. Export and keyboard focus still reach culled items.
  - **Level of detail:** below per-layer zoom thresholds, labels, overlay cards and port dots are hidden through root classes (`pv-lod-labels`, `pv-lod-overlays`, `pv-lod-ports`). It's on by default only while culling is active, so small diagrams look exactly as before. `lod: { labels, overlays, ports }` sets the thresholds; `lod: false` turns it off.
- 7c587ec: React node renderers (FR-45): `<PipelineView nodeRenderers={{ 'app/card': Card }}>` renders a React component inside each node of that type.
  
  - The component receives `{ node, data, status, selected, ports }`.
  - The library still draws the ports, the selection box and the routes, and SVG symbols and React nodes can be mixed.
  - Each node re-renders only when its own data, status or selection changes (a memo per node).
  - `{ component, sizing: 'content' }` sizes the node from its content (ResizeObserver). Bounds and routes follow the measured size, and ports scale from the symbol's declared size. Measuring is view state: no modelChange, no undo step.
  - Core gains the matching `nodeRenderers` option, with plain `HtmlRenderer`s, for non-React hosts.
- 55d178d: Per-node ports (FR-40): `sidePorts(size, side, count, opts)` builds evenly spaced ports (ids, roles, optional index labels), and computed ports/sizes are cached per node and de-duplicated. When an update removes ports (through `data`, `type` or `NodeModel.ports`), the links on those ports are removed in the same transaction (one undo step) and listed in the modelChange diff. The renderer redraws ports and port labels, updates the routing obstacle and reroutes attached links when a node's size or ports change.
- 0e41a19: Problem markers (FR-48):
  
  - `diagram.setIssues({ nodes, links })` replaces every marker at once; `getIssues()` reads them back. Issues (`{ severity: 'error' | 'warning' | 'info', message, code? }`) are view state, so they are never saved with the model or exported.
  - Each item with issues gets a badge in its own layer, at a node's top-right corner or at the middle of a link's route. The badge shows an icon for the worst severity and has a tooltip listing the messages; clicking it hits the item.
  - The item itself gets `data-issue-severity` (worst severity) and an `aria-description` listing the messages, worst first.
  - `diagram.nextIssue(1 | -1)` and F8 / Shift+F8 step through marked items in reading order. Each step selects the item, scrolls it into view, and focuses it if it's a node.
  - `<PipelineView issues={…}>` applies the markers whenever the object's identity changes.
  - New theme tokens: `--pv-issue-error`, `--pv-issue-warning`, `--pv-issue-info`, `--pv-issue-ink` and `--pv-issue-badge-ring`.
- d3388f1: Port roles, limits and explained refusals (FR-41, FR-42). A shared `validateConnect()` applies, in order: missing port, same port, `noSelfLoops`, `accepts`, `directed` (per kind) with outlet → inlet roles, `maxLinks` on both ends, duplicates, then the host's `canConnect`, which can run first with `canConnectOrder: 'before-builtins'`. Dragging from an inlet stores the link in flow order. Every refusal has a code, `detail` and an English reason that `refusalMessages(code, ctx)` can replace, for custom codes too. In the editor, refusing ports get `data-refused` plus the reason (also as a tooltip), the hovered one shows the reason next to the pointer, and a drop on a refusing port or node emits `connectRejected` (a drop on empty canvas is a cancel). A drop on a node's body connects to its nearest accepting port. Ports with links get `data-occupied`. A user edit that would remove a port carrying a locked link is refused (the transaction rolls back). `EditorCommands` gains `checkConnect` / `tryConnect` / `portChecks` and `checkDrop` / `tryDrop`, which return the reason from `canDrop`.
- be8cbfd: Testing support (FR-53):
  
  - New subpath `@vespenelabs/pipeline-view/testing`: `createTestDiagram()`, actions that dispatch real pointer/keyboard events through the editor (`connect`, `drag`, `drop`, `click`, `pressKey`), queries (`getNodeByLabel`, `getPort`, `getNodeElement`, `getLinkElement`, `findLinks`) and the `expectLink` assertion. Each action renders synchronously before it returns. All helpers also accept a `Diagram` from `<PipelineView onReady>`.
  - Stable test hooks: rendered nodes, ports and links carry `data-pv-node-id`, `data-pv-port-id` and `data-pv-link-id`.
  - The library now runs under jsdom as well as happy-dom (both are in CI). `exportSVG()` declares its namespaces with `setAttributeNS`, so jsdom no longer serializes the declarations twice. `isEditableTarget()` falls back to the `contenteditable` attribute where `isContentEditable` is missing.
- 0db85cc: Viewport controls and saving the view (FR-47):
  
  - `<ViewportControls/>`: an accessible toolbar (zoom in/out, fit, reset, optional lock) placed in the diagram's corner, with overridable labels and styling through `--pv-*` tokens (`.pv-viewport-controls`).
  - `initialViewport`, plus `fitOnLoad: 'always' | 'if-no-viewport' | 'never'` (default `'if-no-viewport'`). The fit waits until HTML and React content has rendered and been measured, and any viewport change before then cancels it. `<PipelineView fitOnLoad initialViewport>` delegates to these.
  - `viewportChange` now carries `final`: true for instant programmatic changes, at the end of a drag or pinch, ~150 ms after the last wheel event, and on the last animation frame. Hosts can save the view once instead of on every frame.
  - **Behaviour change for vanilla users:** `load()` now fits the view by default once content is measured (`fitOnLoad: 'if-no-viewport'`). Pass `fitOnLoad: 'never'` to keep the previous behaviour. `<PipelineView>` already fitted on load, so React users see no change.
  - `diagram.lockViewport(locked)` / `isViewportLocked()` stop user pan and zoom (a locked wheel scrolls the page); programmatic changes still apply.

### Patch Changes

- 4f307fe: Problem markers: the issue messages now also go into an SVG `<desc>` on the marked node or link, alongside `aria-description`. Browsers expose `<desc>` as the element's accessible description, so screen readers with patchy `aria-description` support (VoiceOver) read the messages too. Exported SVG leaves it out.
- 2f6a964: Fix: when `onBeforeDelete` or `beforeChange` returns a Promise and the model changes while it's pending (an edit, undo, load, or a gesture in progress), the approved change is now dropped instead of being replayed over the newer edits. Live data ticks don't count as changes.

## 1.1.0

### Minor Changes

- First registry release, on GitHub Packages (private). pipeline-view now ships as one package, `@vespenelabs/pipeline-view`, with subpath exports: `.` (core), `./symbols`, `./react` and `./styles.css`. The subpaths share one core instance (one symbol registry), and their types share one declaration of each class. React is an optional peer dependency.
