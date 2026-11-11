---
'@vespenelabs/pipeline-view': minor
---

Hide annotations as display state: `diagram.setHiddenAnnotations(ids | predicate | null)`, or `<PipelineView hiddenAnnotations>`. Hidden cards, text annotations and their leaders disappear, but the model, undo history, dirty state and routing are untouched, and hidden annotations are left out of fitting. Renderers stay mounted while hidden, so React state survives a toggle. `diagram.isAnnotationHidden(id)` reports the state, and hidden slots get `data-hidden`.
