---
'@pipeline-view/core': patch
---

The editor draws its adornments in its own `<g class="pv-editor">` inside the interaction layer, so it no longer clears other content there (such as the keyboard focus ring).
