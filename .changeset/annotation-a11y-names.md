---
'@vespenelabs/pipeline-view': minor
---

Accessible names and announcements for draggable annotations are now the host's to shape. `annotationName(annotation, anchor)` sets a draggable annotation's `aria-label` and the name used in move announcements, for hosts whose labels live in node data. Without it (or when it returns undefined) the name is the text annotation's text, then the anchor node's label, then the annotation id; an unlabelled anchor's internal id is no longer read out. Names update in place when the annotation or its anchor changes (live data included), and `diagram.refreshAnnotationNames()` re-reads them when something else changed, such as the locale.

`annotationMessages: { moved?(name, position, final), cancelled?(name) }` phrases or localizes the announcements. The default for a finished move is now "Moved {name}." without coordinates, pointer drags are announced too, and each keyboard step announces the rounded position. A cancelled move, or a commit vetoed by `beforeChange`, says "Move cancelled. {name}.".

`<PipelineView>` takes `annotationName` and `annotationMessages` as props that can change at any time.
