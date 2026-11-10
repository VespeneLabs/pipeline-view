# @vespenelabs/pipeline-view

Interactive process / P&ID diagrams for SCADA-style live monitors and diagram editors: a framework-agnostic core, 54 P&ID symbols, and React bindings, in one package. It has no runtime dependencies, and React is an optional peer.

Private package on GitHub Packages. See [Installing from GitHub Packages](https://github.com/VespeneLabs/pipeline-view#installing-from-github-packages) for the `.npmrc` setup, then:

```sh
npm install @vespenelabs/pipeline-view            # plus react react-dom for the React bindings
```

## Imports

```ts
import { Diagram, registerSymbol, type DiagramModel } from '@vespenelabs/pipeline-view'; // core
import { gasSymbols, processSymbols, gateValve } from '@vespenelabs/pipeline-view/symbols';
import { PipelineView, SymbolPalette, useSelection } from '@vespenelabs/pipeline-view/react';
import '@vespenelabs/pipeline-view/styles.css';
```

All subpaths share one core instance, and the types share one declaration of each class. Symbols registered through `/symbols` (or `registerSymbol`) are visible to every `Diagram`, and a `Diagram` from `/react` is the same type as one from the root.

## Quick start (vanilla)

```ts
const diagram = new Diagram({ symbols: [...gasSymbols, ...processSymbols] });
diagram.mount(document.getElementById('plant')!);
diagram.load(model);
diagram.zoomToFit();
diagram.setNodeData('T1', { level: 0.62 }, 'normal'); // live values: no undo, no re-routing
```

## Controlled mode (your own store)

When your app keeps the document in its own store (Zustand, Redux, …), let the store own the truth and the history, and let the diagram apply differences:

```tsx
import { create } from 'zustand';
import { PipelineView } from '@vespenelabs/pipeline-view/react';
import type { DiagramModel, ModelPatch } from '@vespenelabs/pipeline-view';

const useDoc = create<{ model: DiagramModel; past: ModelPatch[] }>(() => ({ model: initial, past: [] }));

<PipelineView
  model={useDoc((s) => s.model)}
  options={{ history: false }}                        // the store owns undo
  onModelChange={({ model, patch }) =>                // user edits: one JSON patch each
    useDoc.setState((s) => ({ model, past: [...s.past, patch!] }))}
/>;
```

- A new `model` from the store is applied with `diagram.patch()`: only the difference changes, untouched links aren't re-routed, and viewport, selection and live values (`setNodeData`) survive. Passing back the model you received in `onModelChange` costs nothing.
- Prefer patches to whole models? Call `diagram.applyDiff(patch)` yourself. Every `modelChange` carries the JSON `patch` of the change.
- Want the store to hold undo entries instead? Pass `history: { push, undo, redo }`. The diagram pushes `{ forward, inverse }` patches and applies the one your `undo()`/`redo()` returns.
- `diagram.isDirty()` / `markSaved()` track unsaved changes against the last save (live values don't count).

For React (`<PipelineView>`), theming, the editor, export and SSR, see the [repository README](https://github.com/VespeneLabs/pipeline-view#readme) and the docs app.

MIT © VespeneLabs
