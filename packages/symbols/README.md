# @pipeline-view/symbols

P&ID symbol packs for [`@pipeline-view/core`](../core): **50 gas-service symbols** (numbered 01–50 as in the reference sheet: valves, actuation and protection, gas equipment, instrumentation, piping and signals) plus **process equipment** (tank, centrifugal pump, control valve) and a **165-symbol extended P&ID pack**.

All symbols are stroke-based and draw with `currentColor`, so they follow the `--pv-*` theme tokens. Bound text is escaped. Each symbol is a separate export and tree-shakes on its own.

```sh
npm install @pipeline-view/core @pipeline-view/symbols
```

```ts
import { Diagram } from '@pipeline-view/core';
import { gasSymbols, pidSymbols, processSymbols, registerGasSymbols, gateValve, pump } from '@pipeline-view/symbols';

// Everything, per diagram instance…
new Diagram({ symbols: [...gasSymbols, ...processSymbols, ...pidSymbols] });
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
| Instrument bubbles | `device`, `location`, `high`, `low` | Outline, line through the bubble, and short texts outside it (see below) |
| `process/instrument` | `mounting` | On a tap, in the line, or on its own |

Ports have stable ids (for example `in`/`out`, or `suction`/`discharge`), and signal ports accept only `signal`/`electrical`/`pneumatic` links. Browse them in the docs symbol gallery.

## Instrument bubbles from data

An instrument bubble is described by a few independent choices, so one symbol, `instrumentBubble` (`process/instrument`), draws all of them from `node.data`. An editor can offer a few fields instead of a symbol per instrument:

| Field | Values | Draws |
| --- | --- | --- |
| `letters`, `loop` | any text | Tag letters and loop number |
| `device` | `discrete` (default), `shared`, `computer`, `plc` | Circle, circle in a square, hexagon, diamond in a square |
| `location` | `field` (default), `panel`, `behind-panel`, `local-panel`, `behind-local-panel` | No line, solid, dashed, double, double dashed |
| `high`, `low` | short text | Qualifiers outside the bubble at the upper and lower right, for example alarm levels or an analyte. They are written beyond the symbol's box |
| `mounting` | `tap` (default), `inline`, `none` | Stem to a `tap` port (62 × 80), a pipe through with `in` / `out` ports (80 × 88), or the bubble alone (62 × 62). The `signal` and `input` ports keep their ids |

```ts
import { instrumentBubble, describeInstrumentLetters } from '@vespenelabs/pipeline-view/symbols';

diagram.update((tx) =>
  tx.addNode({
    id: 'PDT-204',
    type: 'process/instrument',
    position: { x: 200, y: 80 },
    data: { letters: 'PDT', loop: 204, device: 'shared', location: 'panel', high: 'H' },
  }),
);

describeInstrumentLetters('PDT'); // { text: 'Pressure differential transmitter', warnings: [] }
```

The bubbles of the gas and extended packs (`gas/pressure-transmitter`, `pid/shared-display-instrument`, …) are presets of the same drawing: they take the same fields, except `mounting`, and keep their own ports. A value that is missing or unknown falls back to the symbol's default. Metering elements with a shape of their own (orifice plate, turbine meter, rotameter, …) stay separate symbols.

`describeInstrumentLetters()` reads ISA-5.1 tag letters back in English and lists letters that don't fit; `ISA_VARIABLES`, `ISA_MODIFIERS` and `ISA_FUNCTIONS` are its letter tables. It is a help for inspectors and never limits what a diagram holds. To offer ready-made instruments in a palette without registering anything, see the `presets` prop of `<SymbolPalette>`.

## Extended P&ID pack

`pidSymbols` (or `registerPidSymbols()`) adds 165 symbols from the ISA-5.1 and common oil-and-gas legends that the 50-symbol reference sheet leaves out. Their types are prefixed `pid/`, and they use the same six palette categories as the other packs.

| Category | Count | What is in it |
| --- | --- | --- |
| Valves | 14 | Four-way, three-way, stop check, pinch, knife, slide, eccentric rotary disc, bellows-sealed, rotary, bleeder, double block and bleed, angle blowdown, excess flow, float-operated |
| Actuation & protection | 27 | Hand, motor, pneumatic, hydraulic, balanced-diaphragm and quarter-turn combinations; fail-open; positioner, handwheels, electro-hydraulic, bellows, partial stroke test, solenoid reset and multi-way solenoid valves; pilot-operated relief |
| Gas equipment | 31 | Axial, turbine-driven, rotary and liquid ring compressors, blowers, motor, engine, turbine, generator; plate, double-pipe, hairpin, U-tube, kettle and spiral exchangers, heater, condenser, fired heater, boiler; cyclone, gravity and impact separators, filters, vessel internals |
| Instrumentation | 24 | Turbine, ultrasonic, Coriolis, vortex, venturi, nozzle, V-cone, pitot, rotary and diaphragm meters, rotameter, straightening vanes; level gauge, sight glass, thermowell, sample connection, corrosion coupon; bubbles for behind-panel, local panel, shared display, computer and PLC functions |
| Piping & signals | 38 | Spectacle blind, blind and open disc, end cap, union, expansion joint, hose, spool, insulating joint, eccentric reducer, vent, drain, breather, steam trap, ejector, valve manifold; strainers, silencers, pulsation dampener, detonation arrestor; threaded, welded and socket-weld connections; hydraulic, capillary, electromagnetic, data-link and mechanical-link lines, minor process, heat-traced and battery-limit lines |
| Process equipment | 31 | Pump types, vertical, sump and can pumps; roof, floating-roof, double-wall, sphere and spheroid tanks, bin, gas cylinder; cooling towers; tray, packed and contactor columns; dampers |

Two-way valve bodies take `open: false`, and the located instrument bubbles take `letters`, `loop` and the other bubble fields, like the gas pack. The hydraulic, capillary and mechanical line symbols accept links of the kinds `hydraulic`, `capillary` and `mechanical`; style those kinds in your own CSS.

## Custom symbols

Other industries plug in their own packs with `registerSymbol()` from core. See `SymbolDef` (`size`, `ports`, `svg` or `render(ctx)`).

MIT © VespeneLabs
