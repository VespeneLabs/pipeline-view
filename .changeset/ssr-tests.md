---
'@pipeline-view/core': patch
'@pipeline-view/symbols': patch
'@pipeline-view/react': patch
---

SSR safety is now tested: every package is imported and exercised in plain Node with no DOM, and `<PipelineView>` server-renders with its hooks.
