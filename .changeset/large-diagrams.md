---
'@vespenelabs/pipeline-view': minor
---

Large diagrams (FR-55):

- **Culling:** above `culling.threshold` nodes (default 300), nodes, links and HTML/React overlay slots outside the visible area plus `culling.margin` screen pixels (default 200) are hidden. Data ticks for hidden nodes are deferred and applied when they scroll back into view. `culling: false` turns it off. Export and keyboard focus still reach culled items.
- **Level of detail:** below per-layer zoom thresholds, labels, overlay cards and port dots are hidden through root classes (`pv-lod-labels`, `pv-lod-overlays`, `pv-lod-ports`). It's on by default only while culling is active, so small diagrams look exactly as before. `lod: { labels, overlays, ports }` sets the thresholds; `lod: false` turns it off.
