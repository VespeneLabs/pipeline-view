---
'@vespenelabs/pipeline-view': minor
---

Drag from your own palette, and connect by command (FR-50, FR-54). `diagram.acceptDrop({ mimeType, toNode })` accepts HTML5 drops from any host element: `toNode(dataTransfer, point)` builds the node, `canDrop` checks it, and a taken id gets a `_N` suffix. `diagram.startPlacement(type, init)` starts placement mode: a preview starts at the centre of the view and follows the pointer, `canDrop` marks a refused spot (`data-refused` plus the reason), a click places it (touch: where the finger lifts), arrow keys nudge it, Enter places and Esc cancels. Panning is paused for touch while placing. `diagram.connect(from, to, kind)` applies every rule headlessly and returns `{ ok: true, id }` or `{ ok: false, code, reason, detail }`.
