# PRD — pipeline-view

**Status:** Draft v1 · **Date:** 2026-11-10 · **License:** MIT

A modern, framework-agnostic TypeScript library for interactive process / P&ID diagrams (SCADA-style monitoring screens and diagram editors). It does what the [GoJS Industrial Monitor sample](https://gojs.net/latest/samples/industrialMonitor) does, but with a clean, modern look taken from the [Figma reference](https://www.figma.com/design/3hN8q7S6TeBeKY7LKoiHgK/Untitled?node-id=0-1).

---

## 1. Problem & goals

Most process-diagram tooling is either a commercial general-purpose diagram engine (GoJS, JointJS+, yFiles) or an older HMI design. Teams building web monitoring or engineering tools need a lightweight, modern, open-source library that has:

- an accurate, good-looking set of P&ID symbols,
- pipes that route themselves around equipment,
- a clean way to show live values next to equipment,
- the same component for viewing and editing.

### Goals
1. Render process diagrams that match the Figma design: thin slate linework, soft rounded reading cards, and clear typography.
2. Ship all **50 gas-service P&ID symbols**, plus the process-diagram equipment (tanks, pumps, control valves), with ports.
3. Route pipes **orthogonally around nodes** automatically, with manual waypoint overrides.
4. Provide a **viewer mode** (live values, read-only layout) and an **editor mode** (palette, drag, connect, rotate) in one component.
5. Stay **domain-agnostic and minimal**. The library renders the diagram and exposes hooks. Data transport, alarm logic and business rules belong to the host app.
6. **Gas industry first, but open to other industries.** Defaults, built-in symbols and demos are tuned for gas processing, compression, metering and pressure protection. Nothing in the core may assume gas-specific semantics, so water, oil, chemicals, food & beverage, HVAC or power customers can use the library just by adding their own symbol packs.

### Non-goals (v1)
- Data transport adapters (MQTT, OPC UA, WebSocket, REST). The host pushes data in.
- An alarm management lifecycle (ISA-18.2 acknowledge, shelve, suppress, history). The library has no built-in alarm model.
- Writing control commands back to equipment. The library only emits events.
- Certified standard symbol blocks. The symbols follow ISA-5.1 / ISO 10628-2 conventions but are not certified.
- Canvas/WebGL rendering and diagrams with 5k+ nodes.
- Vue, Angular and Web Component wrappers. These are planned after v1.

---

## 2. Decisions (from the requirements interview)

| # | Topic | Decision |
|---|---|---|
| 1 | Engine | Our own **TypeScript core, SVG renderer**, framework-agnostic |
| 2 | Bindings | **React first** (`@pipeline-view/react`). Other frameworks later |
| 3 | Mode | **Viewer + editor** in one component (`mode: 'view' \| 'edit'`) |
| 4 | Symbols | **All 50 Figma symbols + process equipment**, plus a `registerSymbol()` API |
| 5 | Routing | **Auto orthogonal, avoids nodes**, live re-route on move, manual waypoints, line jumps at crossings |
| 6 | Live data | **No transport.** Nodes and annotations can contain **any HTML**. The host updates node data through the API |
| 7 | Status / alarms | **Minimal in the library.** Just a generic `status` hook for styling. Four example states appear **only in the demo** |
| 8 | Scale | **500 nodes / 1,000 links / 2,000 values updating at 1 Hz** with 60 fps pan and zoom |
| 9 | Theming | **CSS custom-property tokens**, light and dark themes in v1 |
| 10 | Delivery | **npm packages + docs/demo site + symbol gallery**, MIT |

---

## 3. Users & use cases

### Target industries
- **Primary: gas industry.** This covers gas processing plants, compressor stations, metering and regulating stations, and transmission and distribution networks. The v1 symbol set, demos and documentation examples target these users first.
- **Secondary: any process industry.** This includes water and wastewater, oil, chemicals, food & beverage, pharma, HVAC and energy. They are supported through the following mechanisms:
  - Industry-neutral core: link `kind`, node `type`, `status` and `data` are all free-form, and no units or media are hard-coded.
  - Symbols ship as separate, tree-shakable packs. The gas pack is the default, and the process equipment from the water-treatment demo shows that a second domain works.
  - `registerSymbol()` lets anyone add an industry pack without forking. Additional official packs (for example water/wastewater and general process) are post-v1 candidates.
  - Theming tokens and labels are not tied to gas service. For example, there are no default colors per medium; host apps define colors such as gas yellow or water blue themselves.

| Persona | Need |
|---|---|
| **Frontend developer** building a monitoring dashboard | Load a diagram JSON, bind live values, react to clicks. Good typings and docs. |
| **Gas process / pipeline engineer** (primary). Other process engineers are secondary. Both use a host app built on the library | Draw or adjust a P&ID with a palette and get clean pipe routing without fiddling. |
| **Operator** (end user of a host app) | Read state at a glance, see which equipment needs attention, and click for details. |

**Key use cases**
1. Show a live process screen, for example the Figma "Editable process diagram": a hot water tank, then a feed pump, mixing vessel, transfer pump, feed valve, holding tank, and out to the next unit, with reading cards.
2. Build or edit a diagram in the editor: drag symbols, connect ports, rotate a valve, and save to JSON.
3. Embed a custom HTML reading card (any React component) next to or inside a node.
4. Click equipment and open a host-provided detail panel.

---

## 4. Functional requirements

### 4.1 Diagram model
- **FR-1** A serializable JSON model: `{ version, nodes[], links[], annotations[], meta }`. Since v1.2 the model is **version 2**. It adds the optional `NodeModel.ports`, `NodeModel.locked` and `LinkModel.locked`; v1 documents still load and are migrated on load (`migrateModel`).
  - Node: `{ id, type, position {x,y}, rotation (0/90/180/270), flip?, label?, data?: Record<string, unknown>, status?: string, ports? }`
  - Link: `{ id, from {node, port}, to {node, port}, kind: 'process' | 'signal' | 'pneumatic' | 'electrical' | string, waypoints?, routing?: 'auto' | 'manual', data? }`
  - Annotation: free text, legend, group/area label (for example "02 / MIX & TRANSFER"), and HTML cards anchored to a node or to a position.
- **FR-2** `diagram.load(model)` and `diagram.toJSON()` round-trip without loss. The model has a version field so it can be migrated later.
- **FR-3** A transactional update API: `diagram.update(fn)` batches changes into one render and one undo step.
- **FR-4** High-frequency data path: `diagram.setNodeData(id, partial)` and `diagram.setNodeDataBatch(map)`. These update bindings without re-routing links or adding undo entries.

### 4.2 Symbols
- **FR-5** Built-in symbol set (`@pipeline-view/symbols`), drawn to match the Figma reference (stroke-based, `currentColor`, about 1.5 px stroke at 1x):
  - **Valves (01–10):** gate, ball, globe, plug, butterfly, swing check, needle, diaphragm, three-way plug, angle globe
  - **Actuation & protection (11–20):** hand-operated gate, pneumatic globe, motor-operated ball, solenoid, piston-actuated gate, pressure-reducing regulator, back-pressure regulator, pressure safety valve, rupture disc, shutdown valve (fail closed)
  - **Gas equipment (21–30):** centrifugal, reciprocating and screw compressors, vertical vessel, horizontal drum, knockout drum, cartridge gas filter, shell-and-tube exchanger, air-cooled exchanger, flare stack
  - **Instrumentation (31–40):** PI, PT, PDT, TI, TT, FT, FIC (panel), LT, LSHH, AT. These are bubbles whose tag letters and loop number come from data.
  - **Piping & signals (41–50):** flow-direction arrow, connected branch (junction dot), crossing with no connection (jump), flanged connection, orifice plate, concentric reducer, Y-strainer, flame arrester, electrical signal line, pneumatic signal line
  - **Process equipment (from the process diagram):** cone-bottom tank / vessel, centrifugal pump, control valve with actuator
- **FR-6** Each symbol declares: an SVG geometry, a default size, **named ports** (position, direction, and which link kinds they accept), its label anchor, and optional **bindable parts**. Examples: valve open/closed state, pump running state, tank fill level (0–1), and instrument tag text.
- **FR-7** `registerSymbol(def)` lets consumers add their own symbols from an SVG string or a render function. Custom symbols are treated exactly like built-in ones.
- **FR-8** Nodes support rotation in 90° steps and horizontal/vertical flip. Ports transform with the node.

### 4.3 Links and routing
- **FR-9** Orthogonal routing that **avoids nodes**, with a configurable clearance, a minimal number of bends, and spreading of parallel pipes.
- **FR-10** Links re-route live while a node is dragged or rotated, without visible jank at the target scale.
- **FR-11** Manual waypoints. Users can drag segments or add/remove bends. A link with `routing: 'manual'` keeps its user waypoints, and only the segments touching a moved node are adjusted.
- **FR-12** **Line jumps** (a hop) where process lines cross without connecting. A **junction dot** is drawn where they branch.
- **FR-13** Link styles by `kind`: solid process line, dashed instrument signal, and pneumatic/electrical signal conventions.
- **FR-14** Flow-direction arrows along segments. An optional **flow animation** (moving dashes or chevrons) can be turned on per link with a binding such as `data.flowing`. It respects `prefers-reduced-motion`.

### 4.4 HTML content (live values)
- **FR-15** Any node or annotation can render **arbitrary HTML** in an HTML overlay layer that stays aligned with SVG coordinates (pan, zoom and rotation-aware positioning; text is never rotated).
- **FR-16** The React binding accepts **React components** as node renderers or card renderers: `nodeContent={{ readingCard: ReadingCard }}`. Updates happen through ordinary React re-renders.
- **FR-17** A reference **ReadingCard** component, styled like the Figma cards (tag, value, unit, status line), is provided in the demo and docs as copyable code. It is not part of the core API.
- **FR-18** Leader lines connect a card to its node (the dashed signal line in Figma) and re-route when either end moves.

### 4.5 Status (minimal)
- **FR-19** Each node or link has an optional free-form `status` string. The library sets it as `data-status="<value>"` on the rendered element and does nothing else with it. Consumers style it with CSS or tokens.
- **FR-20** Selection highlight is built in. In Figma this is the blue rounded box around FCV101.
- The demo (not the library) shows **4 example states**: `normal` ("● Within range", green), `warning` ("△ Low temperature", amber), `alarm` ("! Low flow", red), and `stale/offline` (grey). Each uses shape, color and text together, never color alone.

### 4.6 Viewer mode
- **FR-21** Pan (drag or scroll), zoom (wheel, pinch, buttons), zoom-to-fit, zoom-to-node, and minimap (optional).
- **FR-22** Hover tooltips (host-provided content), click and double-click events, and a context-menu event.
- **FR-23** The layout is read-only. Nodes and links are not draggable or editable.

### 4.7 Editor mode
- **FR-24** A symbol palette (a React component, searchable and grouped by the five categories plus custom), with drag-to-canvas.
- **FR-25** Move, multi-select (marquee, shift-click), snap-to-grid, alignment guides, rotate (R key or handle), flip, delete, copy/paste, and duplicate.
- **FR-26** Connect by dragging from port to port. Ports highlight when they are compatible (according to link kind) and refuse otherwise.
- **FR-27** Inline label editing and editing of node properties through the host (the library emits selection events; the host renders the inspector).
- **FR-28** Undo and redo for all edit operations, with keyboard shortcuts.
- **FR-29** Validation hooks: `canConnect(from, to)` and `canDrop(symbol, position)`.

### 4.8 Events and API
- **FR-30** Typed events: `nodeClick`, `nodeDoubleClick`, `linkClick`, `selectionChange`, `modelChange` (with a diff), `viewportChange`, `contextMenu`, `hover`.
- **FR-31** Commands go out only as events (for example, a double-click on a valve produces `nodeDoubleClick`). The host decides what to do. The library never contacts equipment.
- **FR-32** Export: SVG and PNG of the full diagram or the current viewport.

### 4.9 Theming
- **FR-33** All visual values are CSS custom properties (`--pv-line`, `--pv-line-signal`, `--pv-symbol-stroke`, `--pv-bg`, `--pv-grid`, `--pv-selection`, `--pv-card-bg`, `--pv-card-border`, `--pv-radius`, `--pv-font`, and the status example tokens). The values are taken from the Figma reference.
- **FR-34** Light and dark themes ship in v1. The theme follows `prefers-color-scheme` by default and can be overridden with `theme: 'light' | 'dark'` or a `data-theme` attribute.
- **FR-35** Symbols use `currentColor`, so recoloring needs only CSS.

---

## 5. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-1 Performance | 500 nodes, 1,000 links and 2,000 bound values updating at 1 Hz. Pan and zoom hold ≥ 55 fps on a mid-range laptop (M1 or similar, Chrome). A single data tick takes ≤ 4 ms main-thread time. Re-routing during a drag takes ≤ 16 ms for affected links.<br>**Verification:** the strict budgets (tick ≤ 4 ms, drag ≤ 16 ms, ≥ 55 fps) are checked locally by the bench test `apps/docs/e2e/perf.spec.ts` (run without `CI`). Measured at v1: tick 1.1 ms, drag re-route 1.0 ms, pan/zoom 60 fps. On shared CI runners the same gate takes the best of 3 batches and enforces 1.5× headroom (tick ≤ 6 ms, drag ≤ 24 ms, ≥ 45 fps), because runner noise alone moves the tick between 1.6 and 4.5 ms. |
| NFR-2 Bundle size | `core` ≤ 60 kB gzip, `symbols` ≤ 40 kB gzip (tree-shakable per symbol), `react` ≤ 10 kB gzip. No runtime dependencies in core, apart from an optional routing worker. |
| NFR-3 Browsers | The last 2 versions of Chrome, Edge, Firefox and Safari. Touch: pan, pinch and tap. |
| NFR-4 Accessibility | Keyboard navigation between nodes, ARIA labels from the node label and type, visible focus ring, WCAG AA contrast for both themes, reduced-motion support. |
| NFR-5 TypeScript | Strict types. The model and symbol definitions are generic over the user's `data` shape. |
| NFR-6 Quality | Unit tests for the model and routing, visual regression tests for every symbol in both themes, and an e2e test suite for the editor. Target ≥ 80% coverage in core. |
| NFR-7 SSR safety | Importing the library in Next.js or Remix does not crash. The library renders on the client after mount. |

---

## 6. Architecture

```
@pipeline-view/core      model, commands/undo, router, viewport, SVG renderer, HTML overlay layer, events, export
@pipeline-view/symbols   50 P&ID + process equipment symbol definitions, registerSymbol helpers
@pipeline-view/react     <PipelineView/>, <SymbolPalette/>, hooks (useDiagram, useSelection), React node/card renderers
apps/docs                docs site + live demos + symbol gallery (Storybook or similar)
```

- **Rendering:** an SVG layer for links, symbols and selection, plus an absolutely positioned HTML layer for cards. A single viewport transform drives both. Dirty-tracking updates only the changed elements, and `requestAnimationFrame` batches the work.
- **Routing:** a grid- or visibility-graph-based orthogonal A* with bend penalties. Routing is incremental, so only the links next to a moved node are recomputed. It runs in a Web Worker if NFR-1 requires it.
- **Data path:** `setNodeData` bypasses undo and routing. It only updates bindings and the overlay.
- Monorepo (pnpm + Turborepo), Vite library builds with ESM and type declarations, Changesets for releases.

---

## 7. Deliverables

1. The npm packages `@pipeline-view/core`, `@pipeline-view/symbols` and `@pipeline-view/react` (MIT).
2. A docs site with getting started, an API reference, a theming guide, and a custom symbols guide.
3. **Demo 1 — Process monitor:** a recreation of the Figma "Editable process diagram" with a simulated data generator, ReadingCards, the 4 example statuses, flow animation and a light/dark toggle. This is the equivalent of the GoJS Industrial Monitor.
4. **Demo 2 — P&ID editor:** palette, connect, rotate, undo, and JSON save/load.
5. **Symbol gallery:** all symbols with their ports shown, in both themes (it mirrors the Figma reference page).

---

## 8. Milestones

| Milestone | Scope |
|---|---|
| **M0 — Foundations** | Monorepo, model + JSON, viewport (pan/zoom), SVG renderer, token theming, 5 symbols |
| **M1 — Viewer** | All 50 + process symbols, ports, rotation, auto orthogonal routing, link kinds, HTML overlay, React binding, Demo 1 |
| **M2 — Editor** | Palette, drag/drop, connect, select, undo/redo, manual waypoints, line jumps, Demo 2 |
| **M3 — Polish & release** | Performance pass to NFR-1, accessibility, export, docs site, visual tests, 1.0 on npm |

---

## 9. Success metrics
- Demo 1 is visually indistinguishable from the Figma frame. Reviewed side by side, there are ≤ 2 px deviations in linework placement.
- NFR-1 benchmarks pass (a stress test of a generated 500-node diagram, `apps/docs/perf.html`). The strict budgets are verified locally and in the bench test (v1: tick 1.1 ms, drag 1.0 ms, 60 fps). CI enforces the same gate with 1.5× headroom (≥ 45 fps, best of 3) to absorb shared-runner noise, so a green CI means no regression, not strict compliance.
- A new developer gets a live diagram on screen in **≤ 15 minutes** by following the getting-started guide.
- No pipe ever passes through a node bounding box in auto-routing mode (property-based tests).

---

## 10. Open questions / risks
- **Routing quality versus speed** at 1,000 links. Risk: an aesthetic, GoJS-level AvoidsNodes is hard to get right. Mitigation: build a dedicated routing spike in M0 and evaluate libavoid-js as a fallback.
- **Symbol fidelity.** The Figma symbols are described as "not certified standard blocks". We need to confirm whether exact ISA-5.1 conformance matters for target users.
- **Instrument bubble variants.** ISA distinguishes field, panel and behind-panel bubbles (single line, double line, dashed). Should v1 include all of them, or field and panel only?
- **HTML overlay at extreme zoom.** We need to decide on scaling versus fixed-size cards, and on level-of-detail (hide cards below a zoom threshold).
- **Package name / npm scope:** is `@pipeline-view` available?
- **Industry packs:** which non-gas pack comes second after v1 (water/wastewater or general chemical process)? Should packs use a naming convention like `@pipeline-view/symbols-gas` and `@pipeline-view/symbols-water`?
- **Figma tokens:** the file has no Figma variables defined, so tokens will be extracted manually from the styles. Ideally designers would publish them as Figma variables.

## 11. v1.2 scope

Requested by a host application (a gas editor and monitor built on the library) and approved by the user on 2026-11-10. The library stays generic: domain rules live in host apps and plug in through hooks. Distribution stays private on GitHub Packages as `@vespenelabs/pipeline-view`. Order: P1 (FR-40..45), then FR-47, FR-52, FR-53, then the rest. The shared types for all of these are defined up front in `core/src/{model,symbols,diagram}/types.ts`.

### P1: what a real editor needs

- **FR-40 Ports per node instance.** `SymbolDef.ports` and `size` may be functions of the node (computed from `node.data`), and `NodeModel.ports` overrides both. When a node's ports change, links on removed ports are removed in the same transaction (one undo step) and reported in the modelChange diff. Routing, hit testing, compatible-port highlighting, accessibility and export all use the per-node ports. Readers use `nodePorts()` / `nodeSize()`.
- **FR-41 Port roles and connection limits.** `PortDef.role: 'in' | 'out' | 'both'`: out→in is allowed, and a drag that starts at an inlet still produces from/to in flow order. `PortDef.maxLinks`. A diagram option `directed`, so links always run outlet→inlet and arrows follow. Connected ports get `data-occupied`.
- **FR-42 Explained refusals.** `canConnect` / `canDrop` return `ValidationResult = true | false | { ok: false; reason; code? }`. Built-in checks report the codes `kind-not-accepted`, `duplicate`, `port-full`, `same-port`, `direction` and `cycle`. The `connectRejected { from, to, kind, code, reason, point }` event fires only for drops on a port or node; a drop on empty canvas is a cancel. During a drag, incompatible ports get `data-refused`, with the reason available for a tooltip.
- **FR-43 Hooks before delete and change; locking.** `onBeforeDelete(items) → boolean | Promise<boolean>`, where `items` includes links removed along with nodes, so a host can show its own confirmation. `beforeChange(diff, patch)` vetoes any transaction. `node.locked` / `link.locked` items can't be moved, deleted or reconnected in edit mode, and get `data-locked`.
- **FR-44 Controlled mode.** For hosts that keep the document in their own store: `history: false` or a host `HistoryAdapter { push, undo, redo }` with JSON `HistoryEntry { forward, inverse }` patches. `applyDiff(patch)` and `patch(model)` apply only the difference, with no full reload, no re-route of untouched links and no viewport reset; selection and live data survive. `isDirty()` is measured against `markSaved()`. `modelChange` carries the `patch`. The Zustand pattern is documented.
- **FR-45 React node renderers.** `<PipelineView nodeRenderers={{ type: Component }}>` renders React inside the node's box. The component receives `{ node, data, status, selected, ports }` and can size itself from its content (ResizeObserver). The library still owns and draws the ports. There's a memo boundary per node, so setNodeData re-renders only that node, and SVG and React nodes can be mixed.

### P2: viewer and editor features most apps need

- **FR-46 Minimap.** `<Minimap/>` plus a core MinimapRenderer: node boxes (optionally coloured by status), links as lines, and the visible area as a rectangle. Drag the rectangle to pan; scroll to zoom. Themed with `--pv-minimap-*`. Updates are throttled to stay within NFR-1.
- **FR-47 Viewport controls and saving the view.** An accessible `<ViewportControls/>` (zoom in/out, fit, reset, optional lock). `initialViewport` and `fitOnLoad: 'always' | 'if-no-viewport' | 'never'`. `viewportChange.final` is true at the end of a pan, zoom or animation, so hosts save once. Fit runs only after HTML/React content has been measured.
- **FR-48 Problem markers.** `Issue { severity, message, code? }` on nodes and links, kept outside the saved model and set with `setIssues(map)`, which replaces all of them. Each marked item gets a badge with an icon and tooltip, `data-issue-severity`, and the messages in its ARIA description. zoomToItem and keyboard navigation can step through items with issues.
- **FR-49 Whole-graph rules.** `noCycles: boolean | { kinds }` (refusal code `cycle`), `noSelfLoops` and `maxLinksBetweenNodes`. Graph helpers are exported from core: `topologicalOrder`, `upstreamOf` / `downstreamOf` (filterable by kind), `findCycles` and `connectedComponents`.
- **FR-50 Drag from your own palette.** `acceptDrop({ mimeType, toNode })` handles HTML5 drag and drop from any element. A placement mode, `startPlacement(type, init)`, shows a preview that follows the pointer: a click places it, Esc cancels, and it works on touch. `canDrop` runs on the preview, which gets `data-refused`.
- **FR-51 Comparing two versions.** `compareWith={base}` / `showDiff(base)` marks nodes and links with `data-diff`: added, removed, moved or changed. Removed items are drawn as faded ghosts. A `getDiff(base, current)` helper returns a `ModelComparison` summary.

### P3: quality, accessibility and adoption

- **FR-52 Release policy.** A written semver and deprecation policy. The CHANGELOG gets a separate "Model:" section for changes to the saved model. There's no public npm package.
- **FR-53 Testing support.** Core runs under jsdom as well as happy-dom: no layout APIs at import time, and getBBox and getComputedTextLength are guarded. jsdom is added to CI. The `@vespenelabs/pipeline-view/testing` subpath provides `createTestDiagram`, simulated actions (connect, drag, drop, pressKey), queries (getNodeByLabel, getPort) and `expectLink`. Stable `data-pv-node-id` / `data-pv-port-id` / `data-pv-link-id` attributes.
- **FR-54 Connecting from the keyboard and by command.** Focus a port and press Enter to start, use the arrow keys or Tab to move between compatible ports, Enter to connect, Esc to cancel. A live region announces the result, including the FR-42 reason. A public `connect(from, to, kind)` returns `ConnectResult = { ok: true; id } | { ok: false; code; reason }`.
- **FR-55 Large diagrams.** Render only what's visible (culling of nodes, overlays and React renderers), turned on automatically above a threshold (`culling`). Level of detail by zoom, hiding labels, cards and port dots per layer (`lod`). Optional routing in a Web Worker (`routingWorker`). All of it stays within NFR-1.

