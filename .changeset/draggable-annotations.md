---
'@vespenelabs/pipeline-view': minor
---

Draggable annotations: `annotationDrag: 'edit' | 'always'` (default off) lets users move reading cards and text annotations with the pointer (mouse, pen, touch) or the arrow keys, in view mode as well as edit mode. Leaders follow live, anchored annotations stay relative to their node, and a drag never pans, selects or emits clicks.

The host decides where positions live with `annotationMoves`. `'model'` (the default) commits a finished move as one undoable `update()`. `'display'` keeps it as display state, like hidden annotations: no model change, undo step or dirty flag, and nothing in `toJSON()`. The new `annotationMove { id, position, final }` event (`onAnnotationMove` on `<PipelineView>`) reports every move; save the position when `final` is true and restore it with `diagram.setAnnotationPositions(record | null)`. `diagram.getAnnotationPosition(id)` returns the effective position, which placement, leaders, `itemBounds()` and `getBounds()` now use.

Draggable annotations are focusable and named, a keyboard move is announced through the live region, and `<PipelineView>` gets `annotationDrag`, `annotationMoves` and `onAnnotationMove` props (changeable at any time; `diagram.setAnnotationDrag()` in vanilla). React cards stay mounted during and after a drag. Draggable slots carry `data-draggable` (and `data-dragging` while dragged) for styling; content under `[data-pv-no-drag]` doesn't start a drag.

Model: `AnnotationModel.draggable` is new (optional): `true` makes one annotation draggable in every mode, `false` never. The model version stays 2.
