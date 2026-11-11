---
'@vespenelabs/pipeline-view': minor
---

Link labels now avoid each other as well as nodes. Where several labelled links converge in one corridor (for example just above a shared target in a flowchart), each label slides along its own path to the nearest free spot instead of stacking on the others. Placement uses the estimated boxes (no layout read), is deterministic and independent of the order links were added (labels are placed in link id order), and is incremental: a reroute or a node move re-places only the labels near it.

`labelPosition` is now a preference. The label sits exactly there when the spot is free, as before. When the spot is covered by a node or by another label, it slides along the path to the nearest free spot; before, it stayed put and overlapped. For example `labelPosition: 0` now puts the label just clear of the source node instead of on top of its port.
