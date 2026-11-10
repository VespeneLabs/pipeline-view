---
'@vespenelabs/pipeline-view': minor
---

`modelChange` now carries `origin`: `'user'` for `update()` and editor gestures, `'host'` for `patch()` / `applyDiff()`, and `'history'` for undo/redo (built-in or a `HistoryAdapter`). Hosts in controlled mode can tell their own changes apart from the user's.

`<PipelineView>` no longer echoes the host's own model updates (a new `model` prop applied with `patch()`) through `onModelChange`, so a store doesn't record each of its own edits twice. Pass `emitHostChanges` to get them anyway.
