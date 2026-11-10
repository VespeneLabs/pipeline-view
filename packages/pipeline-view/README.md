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

For React (`<PipelineView>`), theming, the editor, export and SSR, see the [repository README](https://github.com/VespeneLabs/pipeline-view#readme) and the docs app.

MIT © VespeneLabs
