---
'@vespenelabs/pipeline-view': minor
---

Whole-graph rules and graph helpers (FR-49). `noCycles` (all kinds, or `{ kinds }`) refuses a link that would close a loop, with code `cycle` and `detail.cycleNodes`. `maxLinksBetweenNodes` limits links between two nodes through any ports (code `max-links-between-nodes`). New pure helpers that work on a saved model or a live diagram: `upstreamOf` / `downstreamOf` (with `kinds` and a `through(node)` stop condition), `topologicalOrder`, `findCycles`, `connectedComponents` and `flowPath`. `validateConnect` and `isDirected` are exported for host forms.
