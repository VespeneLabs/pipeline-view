# @pipeline-view/core

Framework-agnostic engine for interactive process / P&ID diagrams: SCADA-style live monitors and diagram editors. No runtime dependencies; SVG rendering with an HTML overlay for cards; orthogonal auto-routing with line jumps.

```sh
npm install @pipeline-view/core @pipeline-view/symbols
```

## Quick start

```ts
import { Diagram } from '@pipeline-view/core';
import { gasSymbols, processSymbols } from '@pipeline-view/symbols';
import '@pipeline-view/core/styles.css';

const diagram = new Diagram({ symbols: [...gasSymbols, ...processSymbols], mode: 'view' });
diagram.mount(document.getElementById('plant')!);
diagram.load({
  version: 1,
  nodes: [
    { id: 'T1', type: 'process/tank', position: { x: 0, y: 0 }, label: 'T-101' },
    { id: 'P1', type: 'process/pump', position: { x: 240, y: 40 }, label: 'P-101' },
  ],
  links: [
    { id: 'L1', from: { node: 'T1', port: 'out' }, to: { node: 'P1', port: 'suction' }, kind: 'process' },
  ],
});
diagram.zoomToFit();

// Live values: no undo entry, no re-routing, no modelChange.
diagram.setNodeData('T1', { level: 0.62 }, 'normal');
```

## Two update paths

- `diagram.update(tx => …)`: transactional edits. One undo step, one `modelChange`, and it may re-route.
- `diagram.setNodeData(id, patch, status?)` / `setNodeDataBatch({...})`: the high-frequency live path. It only refreshes bindings, `data-status` and overlays.

## API at a glance

| Area | Methods |
| --- | --- |
| Model | `load`, `toJSON`, `update`, `undo`/`redo`, `preview`/`commitPreview`/`cancelPreview` |
| Live data | `setNodeData`, `setNodeDataBatch` |
| View | `mount`, `setMode('view' \| 'edit')`, `setTheme('light' \| 'dark' \| 'auto')`, `getViewport`/`setViewport`, `zoomToFit`, `zoomToItem`, `screenToDiagram`/`diagramToScreen` |
| Selection | `getSelection`, `setSelection` |
| Events | `on('nodeClick' \| 'nodeDoubleClick' \| 'linkClick' \| 'contextMenu' \| 'hover' \| 'selectionChange' \| 'modelChange' \| 'viewportChange', fn)` |
| Export | `exportSVG()`, `exportPNG({ scale })` |
| Editor | `attachEditor(diagram)` follows `mode === 'edit'` (drag, connect, rotate/flip, copy/paste, undo) |
| Symbols | `registerSymbol(def)`, or `new Diagram({ symbols })` for per-instance symbols |

## Theming

Every visual is a `--pv-*` custom property, with light and dark themes. Set `data-theme="light" | "dark"` on any ancestor, or leave it unset to follow `prefers-color-scheme`. `status` is a free-form string emitted as `data-status`, so you style it yourself:

```css
.pv-node[data-status='alarm'] { color: #b62f38; }
```

## SSR

Safe to import on the server, and the model APIs work there. `mount()` and export need a browser.

MIT © VespeneLabs. Docs and demos: see the [repository](https://github.com/VespeneLabs/pipeline-view).
