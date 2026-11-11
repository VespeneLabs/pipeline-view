---
'@vespenelabs/pipeline-view': minor
---

Port labels can be kept off the pipe. `PortDef.labelPlacement` is one of:

- `'inside'`: the default, unchanged.
- `'above'`: inside the symbol, lifted off the stub.
- `'outside'`: beyond the port, lifted off the line.

`PortDef.labelOffset` nudges the label in diagram units. Placement follows rotation, but the text never rotates. Before this, a manifold's index numbers sat on the pipe stubs and looked struck through.
