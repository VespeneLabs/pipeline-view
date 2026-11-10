---
'@pipeline-view/core': minor
---

Add the SVG renderer and `styles.css`. Nodes come from the SymbolRegistry with rotation/flip, unrotated labels, `data-status` and ports. Links are drawn by kind (process / signal / electrical / pneumatic), with flow arrows, the `data.flowing` animation (respects reduced motion), selection, line jumps and junction dots from the orthogonal router. Updates are dirty-tracked and batched per animation frame; data ticks never reroute. `styles.css` ships every `--pv-*` token with light and dark themes (`data-theme` or `prefers-color-scheme`).
