---
'@pipeline-view/core': patch
---

Fix: the renderer and overlay no longer call `clearTimeout()` with `requestAnimationFrame` ids. Because rAF ids and timer ids are separate counters, that could silently cancel an unrelated host `setTimeout` or `setInterval` with the same number (for example a live-data polling interval).
