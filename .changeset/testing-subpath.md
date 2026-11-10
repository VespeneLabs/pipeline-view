---
'@vespenelabs/pipeline-view': minor
---

Testing support (FR-53):

- New subpath `@vespenelabs/pipeline-view/testing`: `createTestDiagram()`, actions that dispatch real pointer/keyboard events through the editor (`connect`, `drag`, `drop`, `click`, `pressKey`), queries (`getNodeByLabel`, `getPort`, `getNodeElement`, `getLinkElement`, `findLinks`) and the `expectLink` assertion. Each action renders synchronously before it returns. All helpers also accept a `Diagram` from `<PipelineView onReady>`.
- Stable test hooks: rendered nodes, ports and links carry `data-pv-node-id`, `data-pv-port-id` and `data-pv-link-id`.
- The library now runs under jsdom as well as happy-dom (both are in CI). `exportSVG()` declares its namespaces with `setAttributeNS`, so jsdom no longer serializes the declarations twice. `isEditableTarget()` falls back to the `contenteditable` attribute where `isContentEditable` is missing.
