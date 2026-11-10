---
'@vespenelabs/pipeline-view': minor
---

Refusals are now always in flow order. `refusalMessages(code, ctx)`, `connectRejected` and the `from` / `to` returned with a refusal describe the link outlet → inlet, however the user dragged it. Before, built-in refusals used the drag order, so a drag from an inlet swapped the names in host messages. When the drag order differs, it's available as `dragFrom` / `dragTo` (additive fields). The `validateConnect` docs now spell out the check order: `maxLinksBetweenNodes` counts both directions and runs before the cycle check.
