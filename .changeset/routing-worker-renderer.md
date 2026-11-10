---
'@vespenelabs/pipeline-view': minor
---

`routingWorker: true` (or `{ createWorker }` for a bundler-specific worker import) routes the initial full pass of large diagrams (at least `culling.threshold` links) in a Web Worker (FR-55). Links show as straight placeholders until the routes arrive, and edits made meanwhile keep their main-thread routes. A newer load drops a stale result, a worker failure falls back to main-thread routing, and incremental re-routes stay on the main thread.
