---
'@vespenelabs/pipeline-view': minor
---

The host can decide where the links that share one port part: `NodeModel.branchPoints`, a point per port id, relative to the node's position so it travels with the node. The links run one shared trunk from the port to the point (straight out of the port, then one turn) and leave it in different directions, so the junction dot sits on the point and stays there when one of the links is re-routed. Without an entry the router decides as before.

An entry is ignored while fewer than two auto-routed links are drawn on the port (manual links and ends attached to another link don't count), or while the trunk would run through a node. Because it is a node field it is saved, undoable and part of `modelChange.patch`, and `getDiff` / `showDiff` count a change as `moved`. The model stays at version 2; the value may later also be a list of points.

`diagram.getBranchPoint(node, port)` returns `{ point, fixed }` in diagram coordinates: the host-given point when it is in effect, else the point where the router's routes part.

In edit mode, the ports of selected nodes and the end ports of selected links show a diamond handle at that point (`.pv-branch-handle`, with `.pv-fixed` when host-given). Drag it (grid snapping applies), or focus it with Tab and use the arrow keys (Shift for a grid step); Delete hands the point back to the router and Escape returns focus to the canvas. Each committed move is one undo step, emits `branchPointMove` with `{ node, port, point, at }` (`null` when cleared; `onBranchPointMove` in React) and is announced to screen readers, with `branchPointMessages.moved` / `cleared` to phrase or localize it. `EditorCommands.setBranchPoint(node, port, at | null)` does the same from code.

`trunkPath`, `partingPoint` and `branchDirections` are exported for hosts that draw their own previews.
