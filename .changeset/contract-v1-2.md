---
'@vespenelabs/pipeline-view': minor
---

Shared contract for v1.2 (PRD §11, FR-40..55). New: `PortDef.role` / `maxLinks`; `SymbolDef.ports` and `size` can be functions of the node, and `NodeModel.ports` overrides them (read them through `nodePorts()` / `nodeSize()`); `ValidationResult` (`true | false | { ok: false, reason, code? }`) for `canConnect` / `canDrop`; the `connectRejected` event (and an `onConnectRejected` prop); `viewportChange.final`; `modelChange.patch`; and option and method types for history adapters, delete/change hooks, viewport persistence, issues, graph rules, drop sources, comparisons and large-diagram tuning. These land feature by feature.

Model: the saved model is now **version 2**. It adds the optional `NodeModel.ports`, `NodeModel.locked` and `LinkModel.locked`. v1 documents still load (they're migrated on load, see `migrateModel`); `toJSON()` writes version 2.
