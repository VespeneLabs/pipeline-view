---
'@vespenelabs/pipeline-view': minor
---

`getBounds()` now includes node labels and routed link paths, so `zoomToFit()`, the fit on load and the export frame no longer cut off a label that is wider than its symbol at the edge of a drawing, or a pipe that runs around the outside. Label boxes are estimated from the text (the same estimate that routing around labels uses); `nodeLabelBox(node, def)` and `nodeLabelAnchor(node, def)` are exported. Links count with their routed paths once the diagram is mounted and with their manual waypoints before that. Fits of drawings with wide edge labels come out slightly smaller than before.
