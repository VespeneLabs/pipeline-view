---
'@vespenelabs/pipeline-view': minor
---

Controlled mode (FR-44), for apps that keep the document in their own store:

- `diagram.patch(model)` applies only the difference to the current model, with no reload, no re-route of untouched links and no viewport reset. Selection and live values written by `setNodeData` survive. It isn't undoable by default.
- `diagram.applyDiff(patch)` applies a JSON `ModelPatch` as one transaction, and every `modelChange` now carries the `patch` of the change.
- The `history` option: `false` turns undo off (the host owns it), or a `{ push, undo, redo }` adapter stores `{ forward, inverse }` patches in the host's history.
- `isDirty()` / `markSaved()` track unsaved changes and ignore live values.
- `<PipelineView model>` now patches a new version of the same document instead of reloading it. A model sharing no node or link ids with the current one is still loaded from scratch.
