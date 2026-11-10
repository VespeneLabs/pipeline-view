# @pipeline-view/react

## 1.0.0

### Major Changes

- First stable release of pipeline-view: interactive process / P&ID diagrams for live SCADA-style monitors and diagram editors. It includes the framework-agnostic core (model, undo/redo, orthogonal routing with line jumps, SVG renderer with HTML overlay, editor, accessibility, export, theming), 50 gas-service P&ID symbols plus process equipment, and React bindings.

### Minor Changes

- 2e9deb9: Add `<PipelineView>` (SSR-safe and StrictMode-safe; a ref and `onReady` expose the Diagram; a controlled `model` with no reload loop; `mode` / `theme` / `symbols` / `renderers` props; event props for every DiagramEvent) and React overlay renderers mounted through portals, so they keep the host's context. Hooks: `useDiagram`, `useDiagramEvent`, `useSelection`, `useViewport`, `useHistory`.
- 047c29d: Add `<SymbolPalette/>`: searchable (name, keywords, category, type, ref number), grouped by category in P&ID order, symbol previews, HTML5 drag to a `<PipelineView>` in edit mode, and click/Enter to insert at the center of the view. Core `styles.css` gains the palette and editor-adornment styles (tokens only).

### Patch Changes

- 3242c88: Package metadata for 1.0: keywords, homepage, bugs, engines, `publishConfig.access`, a README and LICENSE in each package. CI now packs every package and verifies the tarball contents and type resolution.
- 5786165: SSR safety is now tested: every package is imported and exercised in plain Node with no DOM, and `<PipelineView>` server-renders with its hooks.
- Updated dependencies [568d8fc]
- Updated dependencies [07cef09]
- Updated dependencies [2ccaf81]
- Updated dependencies [d8aad9f]
- Updated dependencies [6f0c37f]
- Updated dependencies [39d5baf]
- Updated dependencies [4351092]
- Updated dependencies [d69a0fd]
- Updated dependencies [45d31c3]
- Updated dependencies [a9502e2]
- Updated dependencies [b2610fc]
- Updated dependencies [e839f4e]
- Updated dependencies [98e5f51]
- Updated dependencies [3636bfe]
- Updated dependencies [8256595]
- Updated dependencies [4f914ec]
- Updated dependencies [3242c88]
- Updated dependencies [6d223c2]
- Updated dependencies
- Updated dependencies [5786165]
- Updated dependencies [047c29d]
  - @pipeline-view/core@1.0.0
