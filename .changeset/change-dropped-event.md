---
'@vespenelabs/pipeline-view': minor
---

New `changeDropped { reason: 'stale', diff }` event (and the `onChangeDropped` prop on `<PipelineView>`): it tells the host when a change approved by an async `onBeforeDelete` / `beforeChange` wasn't applied, because the model changed while the Promise was pending.
