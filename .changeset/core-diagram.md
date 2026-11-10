---
'@pipeline-view/core': minor
---

Add the headless `Diagram` class: model store with `load`/`toJSON` round-trip and validation, transactional `update()` with undo/redo, `preview()`/`commitPreview()`/`cancelPreview()` for interactive gestures, the `setNodeData`/`setNodeDataBatch` live-data fast path (no undo, no modelChange), typed events and selection.
