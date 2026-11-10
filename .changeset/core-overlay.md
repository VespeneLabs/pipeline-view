---
'@pipeline-view/core': minor
---

Add annotations and the HTML overlay. Text annotations render as SVG text (`label` / `area` / `legend` variants). HTML annotations and nodes with `data.overlay` mount through `htmlRenderers`, positioned in diagram space and never rotated. Anchored annotations follow their node and receive its live data. Leader lines connect an annotation to its anchor (FR-18). Pointer events are emitted (`nodeClick`, `nodeDoubleClick`, `linkClick`, `contextMenu`, `hover`), with click-to-select in view mode.
