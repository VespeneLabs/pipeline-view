---
'@vespenelabs/pipeline-view': minor
---

Text drawn inside a symbol now stays upright and unmirrored when the node is rotated or flipped, the way node labels already do. This covers every `<text>` in a symbol's `svg` or `render` output, in the built-in packs and in host symbols: each text turns back around its own centre, and stacked lines (the tag letters and loop number of an instrument bubble) turn as one block, so they keep their place in the shape and their order. A bubble flipped to put its stem on top reads "PT", not its mirror image. Exports and the ghosts of removed nodes in a comparison follow.

Set `uprightText: false` on a `SymbolDef` when the text is part of the drawing and must turn with it. Note that under a quarter turn the text keeps its horizontal reading direction, so a long string in a narrow symbol can reach outside the shape.
