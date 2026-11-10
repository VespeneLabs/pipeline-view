---
'@vespenelabs/pipeline-view': minor
---

Five new industry-neutral process symbols (`registerProcessSymbols()`):

- `process/off-page-inlet` / `process/off-page-outlet`: where a line enters from or leaves to another drawing or a utility. The tag (`"GAS"`, `"N2"`, a drawing ref) comes from `data.text`.
- `process/inline-instrument`: the pipe runs through, with an ISA bubble on a short tap above. Letters and loop come from data, and `data.flowElement: true` adds flow-element bars. It has `in`/`out` pipe ports plus a `signal` port.
- `process/header`: a header/manifold with `data.inlets` / `data.outlets` (1–32) indexed ports, growing with the count.
- `process/burner`: a consumer / burner with one inlet.

The gas pack stays the 50 numbered reference symbols.
