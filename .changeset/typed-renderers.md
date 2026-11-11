---
'@vespenelabs/pipeline-view': minor
---

Renderer data is typed. `ReactRenderer<D>` / `OverlayItem<D>`, `NodeRendererProps<D>` / `NodeRendererEntry<D>` and core's `HtmlRenderer<D>` take the data type, so `item.data`, `props.data` and `props.node` are typed without casts. Typed renderers go straight into `renderers`, `nodeRenderers` and `htmlRenderers`, and one map can mix renderers typed for different data. Every type parameter defaults to `DataRecord`, so existing code compiles unchanged.
