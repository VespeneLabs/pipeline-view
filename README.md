# pipeline-view

TypeScript library for interactive P&ID and process diagrams, built for the gas industry and open to any process industry: SCADA-style live monitors and diagram editors in one component.

- **54 symbols**: the 50 gas-service P&ID symbols (valves, actuators, compressors, vessels, instruments, piping) plus tank, cone-bottom tank, pump and control valve, and `registerSymbol()` for your own packs
- **Orthogonal, node-avoiding pipe routing** with manual waypoints, line jumps and junction dots
- **Live values** through arbitrary HTML / React overlays, with no transport lock-in
- **Viewer and editor** modes: palette, connect, rotate, undo/redo, JSON save/load
- **Light and dark themes** via `--pv-*` CSS tokens; symbols follow `currentColor`
- Framework-agnostic core with **no runtime dependencies**, plus React bindings; safe to import during SSR

> **Status:** v1. Released as tarballs on [GitHub Releases](https://github.com/VespeneLabs/pipeline-view/releases) (not on npm). Scope and decisions: [PRD.md](./PRD.md).

| Package | What it is |
| --- | --- |
| `@pipeline-view/core` | Model and JSON, commands/undo, router, viewport, SVG renderer, HTML overlay, editor, export |
| `@pipeline-view/symbols` | Gas P&ID pack and process equipment (tree-shakable, one module per symbol) |
| `@pipeline-view/react` | `<PipelineView/>`, `<SymbolPalette/>`, hooks |

## Install

Each release attaches one tarball per package. Install the ones you need in a single command, so the packages resolve to each other (replace `1.0.0` with the release you want):

```sh
V=1.0.0
BASE=https://github.com/VespeneLabs/pipeline-view/releases/download/v$V
npm install $BASE/pipeline-view-core-$V.tgz $BASE/pipeline-view-symbols-$V.tgz $BASE/pipeline-view-react-$V.tgz
```

`pnpm add` and `yarn add` take the same URLs. `@pipeline-view/react` needs React 18 or later.

## Quick start

React:

```tsx
import { PipelineView, type DiagramModel } from '@pipeline-view/react';
import { gasSymbols, processSymbols } from '@pipeline-view/symbols';
import '@pipeline-view/core/styles.css';

const model: DiagramModel = {
  version: 1,
  nodes: [
    { id: 'T1', type: 'process/tank', position: { x: 0, y: 0 }, label: 'T-101', data: { level: 0.6 } },
    { id: 'P1', type: 'process/pump', position: { x: 240, y: 40 }, label: 'P-101' },
  ],
  links: [{ id: 'L1', kind: 'process', from: { node: 'T1', port: 'out' }, to: { node: 'P1', port: 'suction' } }],
} as const;

export function Plant() {
  return (
    <PipelineView
      model={model}
      symbols={[...gasSymbols, ...processSymbols]}
      onReady={(d) => setInterval(() => d.setNodeData('T1', { level: Math.random() }), 1000)}
      style={{ height: 400 }}
    />
  );
}
```

Without React, the same thing is `new Diagram({ symbols })`, then `diagram.mount(element)`, `diagram.load(model)` and `diagram.setNodeData(...)`. See [packages/core/README.md](./packages/core/README.md).

Live data never goes through undo or re-routing: push it with `setNodeData` / `setNodeDataBatch`. Edits go through `diagram.update(tx => …)`, one undo step each. `status` is a free-form string the library only writes to `data-status`; you style it.

## Demos and docs

The docs site with the demos runs locally:

```sh
pnpm install
pnpm build
pnpm dev        # http://localhost:5173
```

- `#/monitor`: **Process monitor**, the Figma reference diagram with live simulated data, reading cards and the four example statuses (add `?static` for the reference state)
- `#/editor`: **P&ID editor** with palette, port-to-port connect, link kinds, undo/redo and JSON save/load
- `#/stress`: **Stress test**, 500 nodes / 1,000 links / 2,000 values at 1 Hz with live perf metrics
- `#/gallery`: every symbol with its ports, in light and dark
- Guides: `#/getting-started`, `#/theming`, `#/custom-symbols`, `#/api`

## Development

pnpm workspace + Turborepo, Node 20 or later. `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm size` (bundle budgets) and `pnpm --filter docs e2e` (Playwright; visual baselines come from Linux CI). See [CLAUDE.md](./CLAUDE.md) for the full command list and conventions.

## License

[MIT](./LICENSE)
