---
'@vespenelabs/pipeline-view': minor
---

Connect from the keyboard (FR-54). With one node selected in edit mode, press C. Choose a source port with the arrow keys or Tab, press Enter, then cycle the compatible target ports (nearest first) and press Enter to connect. Escape steps back, then cancels. A polite live region announces every step, the result and refusal reasons, including `connectRejected` from pointer drops.

Also: host drops (`acceptDrop`) snap to the grid when `grid.snap` is on, like palette drops; `startPlacement()` warns once when no editor is attached instead of doing nothing silently; and the keyboard-connect cursor reveals a culled node.
