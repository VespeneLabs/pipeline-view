---
'@pipeline-view/core': patch
---

Leaders with `leaderWaypoints` now end at the final waypoint when it lies on or inside the anchor node's bounds, instead of adding an extra leg to an edge (matches Figma leaders that meet a vessel shell).
