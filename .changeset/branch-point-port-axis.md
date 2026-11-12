---
'@vespenelabs/pipeline-view': minor
---

A dragged branch point snaps onto the line straight out of its port when the pointer is within the guide snap distance of it (`guideThreshold`, 6 screen pixels by default), in preference to the grid across that line. A port that is off the grid no longer leaves a small jog in the trunk; along the pipe the grid applies as before. Keyboard steps stay exact. `EditorCommands.previewBranchPoint(node, port, at, magnet)` takes the snap distance in diagram units.
