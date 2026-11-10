---
'@vespenelabs/pipeline-view': patch
---

Problem markers: the issue messages now also go into an SVG `<desc>` on the marked node or link, alongside `aria-description`. Browsers expose `<desc>` as the element's accessible description, so screen readers with patchy `aria-description` support (VoiceOver) read the messages too. Exported SVG leaves it out.
