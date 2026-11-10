---
'@vespenelabs/pipeline-view': minor
---

`SymbolDef<D>`'s `size` and `ports` callbacks now receive `NodeModel<D>`, so `node.data` is typed without a cast. A `SymbolDef<D>` can also go into a `SymbolDef[]` or `registerSymbol()` without a cast. All three callbacks (`size`, `ports`, `render`) are now checked bivariantly, the way methods are. Existing code compiles unchanged, but casts like `node.data as MyData` are now unnecessary.
