---
'@vespenelabs/pipeline-view': patch
---

Fix: when `onBeforeDelete` or `beforeChange` returns a Promise and the model changes while it's pending (an edit, undo, load, or a gesture in progress), the approved change is now dropped instead of being replayed over the newer edits. Live data ticks don't count as changes.
