---
'@vespenelabs/pipeline-view': minor
---

Comparing two versions (FR-51):

- `getDiff(base, current, { ignore })` lists how two models differ, node by node and link by link:
  - `added` or `removed`;
  - `moved`: only geometry changed (position, rotation, flips; for links, waypoints or routing);
  - `changed`: anything else changed.
  
  `status` is ignored by default, because it is live state. The function is pure and safe on the server.
- `diagram.showDiff(base)` marks the canvas:
  - `data-diff` on added, moved and changed nodes and links;
  - a dashed outline around marked nodes;
  - removed nodes and links drawn as faded ghosts from the base geometry.

  The marks follow edits. `showDiff(null)` clears them, and `getDiffBase()` reads the current base. Marks are never saved or exported.
- `<PipelineView compareWith={base}>` does the same from React.
- New theme tokens: `--pv-diff-added`, `--pv-diff-removed`, `--pv-diff-moved`, `--pv-diff-changed` and `--pv-diff-ghost-opacity`.
