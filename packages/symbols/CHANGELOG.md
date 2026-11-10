# @pipeline-view/symbols

## 1.0.0

### Major Changes

- First stable release of pipeline-view: interactive process / P&ID diagrams for live SCADA-style monitors and diagram editors. It includes the framework-agnostic core (model, undo/redo, orthogonal routing with line jumps, SVG renderer with HTML overlay, editor, accessibility, export, theming), 50 gas-service P&ID symbols plus process equipment, and React bindings.

### Minor Changes

- 1cfeecf: Add `process/conical-tank` (`conicalTank`), the cone-bottom tank from the Figma process diagram, with a `data.level` binding that fills through the cone.
- da72538: Add all 50 gas-service P&ID symbols (Figma refs 01–50) and the process equipment (tank, pump, control valve), with named ports, bindable parts (valve open/closed, pump running, tank level, instrument tag letters + loop number), `gasSymbols` / `processSymbols` arrays and `registerGasSymbols()` / `registerProcessSymbols()` helpers.

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
