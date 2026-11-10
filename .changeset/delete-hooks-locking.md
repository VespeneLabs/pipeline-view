---
'@vespenelabs/pipeline-view': minor
---

Hooks before delete and before change, and locking (FR-43):

- `onBeforeDelete(items)` is asked before any change that removes items. `items` lists nodes, links and annotations, including the links removed along with a node. Return false, or a Promise of false, to keep them; a host can show its own confirmation dialog. A pending Promise rolls the change back right away, and it's re-applied (as one undo step) only if the Promise resolves true.
- `beforeChange(diff, patch)` can veto any transaction or committed gesture in the same way. Host-driven `applyDiff` / `patch()` and history replays aren't vetoed.
- `node.locked` / `link.locked` items can't be moved, rotated, flipped, deleted or re-routed in edit mode, and a node whose deletion would cascade a locked link stays too. Locked items get a `data-locked` attribute.
