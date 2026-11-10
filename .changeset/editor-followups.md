---
'@pipeline-view/core': patch
---

The renderer now uses the incremental `RouteAnalyzer` (drag frames re-check only rerouted links) and refreshes line jumps and junction dots when links are deleted without a reroute. Editor: `linkKind` option and `setLinkKind()` for new connections (falls back to the start port's accepted kind), `getEditor(diagram)` to reach the attached controller, connect-target circles reused during the drag, and the inline label editor follows pan/zoom.
