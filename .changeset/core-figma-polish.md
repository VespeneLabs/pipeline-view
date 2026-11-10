---
'@pipeline-view/core': minor
---

Match the Figma reference more closely and fix view-mode clicks. A selected node now gets a rounded selection box (`--pv-selection-bg`, `--pv-selection`, `--pv-selection-radius`) and a selection-coloured label. Nodes get a transparent hit box, so clicks inside stroke-only symbols select them. Leader lines are routed orthogonally around nodes, or follow the new optional `leaderWaypoints` on annotations. Pointer capture is taken only once a press becomes a pan, so a plain click in the browser reaches the node instead of being retargeted to the root.
