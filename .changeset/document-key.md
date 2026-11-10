---
'@vespenelabs/pipeline-view': minor
---

`<PipelineView documentKey>`: identify the document being shown, for example a saved diagram's id. When the key changes, the new `model` is loaded from scratch (fit on load, cleared selection, fresh undo history and dirty baseline). While it stays the same, model updates are patched in. Without `documentKey`, shared node/link ids are still the heuristic, which misfires when documents reuse ids (`n1`, `n2`, …), so set the key whenever your app switches documents.
