---
'@vespenelabs/pipeline-view': minor
---

New extended P&ID symbol pack: `pidSymbols` and `registerPidSymbols()` from `@vespenelabs/pipeline-view/symbols` add 165 symbols (types prefixed `pid/`) from the ISA-5.1 and common oil-and-gas legends that the 50-symbol gas reference sheet leaves out. It covers 14 more valve bodies, 27 actuator combinations and details including pilot-operated relief, 24 instruments (flow and metering elements, field devices, bubbles by location), 38 piping items (specials such as spectacle blind and insulating joint, strainers, silencers, end connections, line and signal types), 31 pieces of gas equipment (compressors, drivers, heat exchangers, separators) and 31 of plant equipment (pumps, tanks, cooling towers, columns, dampers). Every symbol is a separate export and tree-shakes on its own. Two-way valve bodies take `open: false`, and the located instrument bubbles take `letters` and `loop`. The existing packs are unchanged.
