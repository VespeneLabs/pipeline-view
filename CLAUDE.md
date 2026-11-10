# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Pre-implementation. The repo holds only `PRD.md`, which is the source of truth for scope and decisions. There is no code, package.json or tooling yet, so there are no build, lint or test commands. Update this file once the monorepo is scaffolded.

Planned tooling (PRD §6): pnpm workspaces + Turborepo, Vite library builds (ESM + .d.ts), Changesets for releases.

## What this is

`pipeline-view` is an MIT-licensed TypeScript library for interactive process / P&ID diagrams: SCADA-style live monitors and diagram editors. It is functionally modeled on the GoJS Industrial Monitor sample, with the visual design taken from the Figma reference below.

## Architecture (planned, see PRD §6)

```
@pipeline-view/core      model + JSON, commands/undo, orthogonal router, viewport, SVG renderer, HTML overlay layer, events, export
@pipeline-view/symbols   50 gas-service P&ID symbols + process equipment (tank, pump, control valve); registerSymbol helpers
@pipeline-view/react     <PipelineView/>, <SymbolPalette/>, hooks
apps/docs                docs site, demos (process monitor, P&ID editor), symbol gallery
```

Rendering uses two layers that share one viewport transform:
- an **SVG layer** for links, symbols and selection;
- an **HTML overlay** for arbitrary HTML / React content such as reading cards. Overlay text is never rotated.

Updates are dirty-tracked and batched with requestAnimationFrame.

There are two update paths, and they must stay separate:
- `diagram.update(fn)` is transactional. It creates one undo step and may trigger re-routing.
- `setNodeData` / `setNodeDataBatch` is the high-frequency live-data path. It never touches undo or routing; it only refreshes bindings and the overlay.

Routing is orthogonal, avoids nodes, and is incremental: only links next to a moved node are recomputed. It may run in a Web Worker. Links with `routing: 'manual'` keep their user waypoints. Line jumps are drawn at crossings that don't connect, and junction dots at branches.

## Design constraints that are easy to violate

- **Gas industry is the primary audience, but the core must stay industry-neutral.** Put gas-specific things in the gas symbol pack, the demos or the docs, never in `core`: no hard-coded media, units or per-medium colors. Other industries plug in through `registerSymbol()` and their own symbol packs.
- **Keep the library domain-agnostic and minimal.** Don't add data transports (MQTT, OPC UA, WebSocket), alarm logic, or equipment write-back to the packages. `status` is a free-form string that the library emits only as a `data-status` attribute. The 4 example states (normal, warning, alarm, stale) and the `ReadingCard` component belong only in the demo/docs app.
- Commands to equipment exist only as emitted events. The host decides what to do with them.
- Core has no runtime dependencies. Respect the bundle budgets: core ≤ 60 kB gzip, symbols ≤ 40 kB and tree-shakable per symbol, react ≤ 10 kB.
- All visuals come from CSS custom properties (`--pv-*`), with light and dark themes. Symbols are stroke-based and use `currentColor`, so never hard-code colors in symbols.
- Performance target: 500 nodes, 1,000 links and 2,000 values updating at 1 Hz, with pan/zoom at ≥ 55 fps. A data tick takes ≤ 4 ms; a re-route during a drag takes ≤ 16 ms.
- Library code must be safe to import during SSR (Next.js, Remix) and render on the client only.

## Design reference (Figma)

- File key `3hN8q7S6TeBeKY7LKoiHgK`.
- Node `1:21`: "Editable process diagram". This is the target that Demo 1 must match.
- Node `1:115`: "Gas P&ID · 50-symbol reference". This is the symbol set and its numbering, 01–50.
- The file defines no Figma variables, so design tokens have to be extracted from the layer styles by hand.
