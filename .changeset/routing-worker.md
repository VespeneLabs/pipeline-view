---
'@vespenelabs/pipeline-view': minor
---

Routing in a Web Worker (FR-55). `createRoutingWorker({ createWorker? })` returns `{ routeAll(obstacles, requests, options), terminate() }`. It routes a full pass off the main thread with the same results as a main-thread pass, and a newer job aborts the previous one (`AbortError`). `Router.adoptRoutes(requests, results)` (an additive, optional contract method) lets the main-thread router take over those routes, so later incremental updates behave as if it had routed them itself. The worker ships next to the code that loads it, plus a `@vespenelabs/pipeline-view/routing-worker` subpath for bundlers that need their own worker import. Nothing is created at import time, so it's SSR-safe.
