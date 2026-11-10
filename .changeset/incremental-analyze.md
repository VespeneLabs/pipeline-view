---
'@pipeline-view/core': patch
---

Add `RouteAnalyzer`, an incremental line-jump/junction analysis: `update(changedRoutes)` re-checks only the changed links against a spatial index, so drag frames no longer pay for a whole-diagram `analyze()`. `Router.analyze()` now uses it internally (same results).
