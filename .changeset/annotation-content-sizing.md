---
'@vespenelabs/pipeline-view': minor
---

HTML annotations can size themselves to their content: `{ kind: 'html', sizing: 'content' }`. The box grows to fit what the renderer draws, with `size` as the minimum, and its leader and bounds follow as the content resizes (live readings, late-loading React content). The default stays `'fixed'`, where the box is exactly `size` and content that doesn't fit overflows it.
