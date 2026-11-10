---
'@vespenelabs/pipeline-view': minor
---

Per-node ports (FR-40): `sidePorts(size, side, count, opts)` builds evenly spaced ports (ids, roles, optional index labels), and computed ports/sizes are cached per node and de-duplicated. When an update removes ports (through `data`, `type` or `NodeModel.ports`), the links on those ports are removed in the same transaction (one undo step) and listed in the modelChange diff. The renderer redraws ports and port labels, updates the routing obstacle and reroutes attached links when a node's size or ports change.
