---
'@vespenelabs/pipeline-view': minor
---

Symbols for the two ends of a supply line, valves on the header, and flow-element bars on the generic instrument.

- New `enclosure` (`process/enclosure`): a cabinet or box that holds a source, with one pipe leaving it. One port `out` with role `out`. A short tag comes from `data.text`; the box widens for a long one and the port moves with it.
- New `outletPoint` (`process/outlet-point`): the end of a line where the medium is taken off. One port `in` with role `in`.
- `process/header` takes `valves: true` in its data and draws a block valve on every outlet, for a valve manifold. Its size, ports and port ids don't change.
- `process/instrument` with `mounting: 'inline'` takes `flowElement: true` and draws the two bars on the pipe that `process/inline-instrument` draws, so one symbol type covers tapped and in-line points.

Both new symbols are part of `processSymbols`, which now holds 12. The new type `EnclosureData` is exported, and `HeaderData` and `InstrumentBubbleData` gained the optional fields above.
