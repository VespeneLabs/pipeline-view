---
'@pipeline-view/core': patch
---

Faster pan/zoom: the viewport no longer writes a `--pv-zoom` custom property on the root every frame. Nothing read it, and each write forced a style recalculation across the whole diagram subtree (about 52 → 60 fps at 500 nodes / 1,000 links).
