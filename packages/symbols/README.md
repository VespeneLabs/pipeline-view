# @pipeline-view/symbols

P&ID symbol packs for [`@pipeline-view/core`](../core): **50 gas-service symbols** (numbered 01–50 as in the reference sheet: valves, actuation and protection, gas equipment, instrumentation, piping and signals) plus **process equipment** (tank, centrifugal pump, control valve).

All symbols are stroke-based and draw with `currentColor`, so they follow the `--pv-*` theme tokens. Bound text is escaped. Each symbol is a separate export and tree-shakes on its own.

```sh
npm install @pipeline-view/core @pipeline-view/symbols
```

```ts
import { Diagram } from '@pipeline-view/core';
import { gasSymbols, processSymbols, registerGasSymbols, gateValve, pump } from '@pipeline-view/symbols';

// Everything, per diagram instance…
new Diagram({ symbols: [...gasSymbols, ...processSymbols] });
// …or globally…
registerGasSymbols();
// …or only what you use (smallest bundle):
new Diagram({ symbols: [gateValve, pump] });
```

## Bindable state (`node.data`)

| Symbols | Field | Effect |
| --- | --- | --- |
| Valves with a closable body | `open: false` | Body drawn filled (closed) |
| `process/pump` | `running: true` | Impeller filled |
| `process/tank` | `level: 0..1` | Fill level, styled by `--pv-level-fill` and `--pv-level-opacity` |
| Instrument bubbles | `letters`, `loop` | Tag letters (e.g. `PIT`) and loop number |

Ports have stable ids (for example `in`/`out`, or `suction`/`discharge`), and signal ports accept only `signal`/`electrical`/`pneumatic` links. Browse them in the docs symbol gallery.

## Custom symbols

Other industries plug in their own packs with `registerSymbol()` from core. See `SymbolDef` (`size`, `ports`, `svg` or `render(ctx)`).

MIT © VespeneLabs
