---
'@vespenelabs/pipeline-view': minor
---

`<PipelineView modelUpdates="undoable">` makes host edits undoable. Each new version of the same document that comes in through the `model` prop, for example from an inspector or side panel editing the host store, becomes one undo step, like a canvas edit. Undo and redo report `origin: 'history'` through `onModelChange`, so the store follows. The default `'host'` keeps the current behavior: patches stay outside the undo history. Loading a different document still starts a fresh history. Before this, hosts called `diagram.patch(model, { undoable: true })` themselves before rendering.
