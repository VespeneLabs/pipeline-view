# @vespenelabs/pipeline-view

## 1.3.0

### Minor Changes

- 04c8a30: `<PipelineView documentKey>`: identify the document being shown, for example a saved diagram's id. When the key changes, the new `model` is loaded from scratch (fit on load, cleared selection, fresh undo history and dirty baseline). While it stays the same, model updates are patched in. Without `documentKey`, shared node/link ids are still the heuristic, which misfires when documents reuse ids (`n1`, `n2`, …), so set the key whenever your app switches documents.
- 985e2f8: Drag from your own palette, and connect by command (FR-50, FR-54). `diagram.acceptDrop({ mimeType, toNode })` accepts HTML5 drops from any host element: `toNode(dataTransfer, point)` builds the node, `canDrop` checks it, and a taken id gets a `_N` suffix. `diagram.startPlacement(type, init)` starts placement mode: a preview starts at the centre of the view and follows the pointer, `canDrop` marks a refused spot (`data-refused` plus the reason), a click places it (touch: where the finger lifts), arrow keys nudge it, Enter places and Esc cancels. Panning is paused for touch while placing. `diagram.connect(from, to, kind)` applies every rule headlessly and returns `{ ok: true, id }` or `{ ok: false, code, reason, detail }`.
- 6ecdb49: Whole-graph rules and graph helpers (FR-49). `noCycles` (all kinds, or `{ kinds }`) refuses a link that would close a loop, with code `cycle` and `detail.cycleNodes`. `maxLinksBetweenNodes` limits links between two nodes through any ports (code `max-links-between-nodes`). New pure helpers that work on a saved model or a live diagram: `upstreamOf` / `downstreamOf` (with `kinds` and a `through(node)` stop condition), `topologicalOrder`, `findCycles`, `connectedComponents` and `flowPath`. `validateConnect` and `isDirected` are exported for host forms.
- 9dee451: `modelChange` now carries `origin`: `'user'` for `update()` and editor gestures, `'host'` for `patch()` / `applyDiff()`, and `'history'` for undo/redo (built-in or a `HistoryAdapter`). Hosts in controlled mode can tell their own changes apart from the user's.
  
  `<PipelineView>` no longer echoes the host's own model updates (a new `model` prop applied with `patch()`) through `onModelChange`, so a store doesn't record each of its own edits twice. Pass `emitHostChanges` to get them anyway.
- 22e914a: Refusals are now always in flow order. `refusalMessages(code, ctx)`, `connectRejected` and the `from` / `to` returned with a refusal describe the link outlet → inlet, however the user dragged it. Before, built-in refusals used the drag order, so a drag from an inlet swapped the names in host messages. When the drag order differs, it's available as `dragFrom` / `dragTo` (additive fields). The `validateConnect` docs now spell out the check order: `maxLinksBetweenNodes` counts both directions and runs before the cycle check.
- 467e8a0: `routingWorker: true` (or `{ createWorker }` for a bundler-specific worker import) routes the initial full pass of large diagrams (at least `culling.threshold` links) in a Web Worker (FR-55). Links show as straight placeholders until the routes arrive, and edits made meanwhile keep their main-thread routes. A newer load drops a stale result, a worker failure falls back to main-thread routing, and incremental re-routes stay on the main thread.
- 7180ea7: Routing in a Web Worker (FR-55). `createRoutingWorker({ createWorker? })` returns `{ routeAll(obstacles, requests, options), terminate() }`. It routes a full pass off the main thread with the same results as a main-thread pass, and a newer job aborts the previous one (`AbortError`). `Router.adoptRoutes(requests, results)` (an additive, optional contract method) lets the main-thread router take over those routes, so later incremental updates behave as if it had routed them itself. The worker ships next to the code that loads it, plus a `@vespenelabs/pipeline-view/routing-worker` subpath for bundlers that need their own worker import. Nothing is created at import time, so it's SSR-safe.

### Patch Changes

- c5d7e41: A content-sized node whose size changes on a data tick no longer re-routes its links unless its ports actually move, or the resized node now covers a link's path. Live values in content-sized cards no longer cost a re-route per tick.

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
