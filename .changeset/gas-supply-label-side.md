---
'@vespenelabs/pipeline-view': minor
---

Gas supply and point-of-use symbols, fill levels on containers, labels beside a node, a component that draws one symbol, and ports a link can leave from the side facing its other end.

- Eight new symbols in the extended pack (`pidSymbols`, now 173): `pid/cylinder-pack`, `pid/dewar` and `pid/tube-trailer` (one `out` port each), `pid/gas-generator` and `pid/ambient-vaporizer` (`in`, `out`), `pid/analytical-instrument` and `pid/welding-torch` (one `in`), and `pid/cutting-torch` (`fuel`, `oxygen`). Their ports carry roles.
- Fill level: `data.level` from 0 to 1 now fills `gas/horizontal-drum`, `gas/vertical-vessel`, `pid/gas-cylinder`, the `pid/` storage tanks, `pid/sphere`, `pid/spheroid-tank` and the three new containers, like `process/tank`. A level that is missing, `null` or not a number is unknown and draws no fill. The fill takes `--pv-level-fill` and `--pv-level-opacity`, which can be set per `data-status`. `LevelData` is exported.
- `NodeModel.labelPosition` (`'top' | 'bottom' | 'left' | 'right' | 'auto'`) puts a node's label on a side of the node as drawn, at every rotation and flip. `'auto'` takes the first of bottom, top, right, left that none of the node's ports faces. `SymbolDef.labelPosition` sets the default for a symbol. Without either, labels stay where they were. `nodeLabelPlacement()` returns the place and text anchor.
- `<SymbolView>` (React) draws one symbol by `type` or `symbol` at a given size with its `data` and `status`, for node renderers, legends and pickers. `symbolSvg()` returns the same as a string and `symbolMarkup()` the inner markup.
- `PortDef.alternates` lists other places a link may leave a port from. Each link is drawn from the place facing the node at its other end; the model still names the one port. `portPointToward()` returns the place for a given target.

Symbol markup may now contain a nested `<svg>` element: the level fill is cut off by one, so it needs no ids.
