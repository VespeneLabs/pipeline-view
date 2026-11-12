---
'@vespenelabs/pipeline-view': minor
---

One symbol for every instrument bubble, and palette presets.

- New `instrumentBubble` (`process/instrument`) in `@vespenelabs/pipeline-view/symbols`, part of `processSymbols`. Its data draws any ISA-5.1 bubble: `letters` and `loop`, `device` (`discrete`, `shared`, `computer`, `plc`), `location` (`field`, `panel`, `behind-panel`, `local-panel`, `behind-local-panel`), `high` / `low` (short texts outside the bubble, for example alarm levels) and `mounting` (`tap`, `inline`, `none`). The mounting sets the size and the process ports; `signal` and `input` keep their ids.
- The instrument bubbles of the gas pack, the inline instrument and the located bubbles of the extended pack are now presets of the same drawing: they also take `device`, `location`, `high` and `low`. With their existing data they draw as before, and their ports are unchanged.
- New `describeInstrumentLetters(letters)` reads ISA-5.1 tag letters back in English ("PDT" is "Pressure differential transmitter") and returns warnings for letters that don't fit, for use in an inspector. `ISA_VARIABLES`, `ISA_MODIFIERS` and `ISA_FUNCTIONS` are its letter tables.
- `<SymbolPalette>` takes `presets`: entries that create a registered symbol with data (and a label) of their own, drawn with that data and found by their own name and keywords.
- For palettes of your own: drag data may carry `SYMBOL_INIT_MIME` (JSON `{ label?, data? }`) next to `SYMBOL_MIME`, and `getEditor(diagram).dropSymbol()` takes the same as a fourth argument.

`InstrumentData` gained the optional fields above, and the new types `InstrumentDevice`, `InstrumentLocation`, `InstrumentMounting`, `InstrumentBubbleData`, `InstrumentLetters`, `SymbolPreset` and `SymbolInit` are exported.
