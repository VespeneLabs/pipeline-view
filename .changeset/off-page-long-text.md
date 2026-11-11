---
'@vespenelabs/pipeline-view': minor
---

The off-page connectors (`process/off-page-inlet`, `process/off-page-outlet`) grow with their tag: `data.text` longer than about 7 characters widens the symbol instead of overflowing it. Short tags keep the 96 px shape. On the inlet the port sits on the tip, so it moves right with the extra width; the node's top-left corner stays where it is.
