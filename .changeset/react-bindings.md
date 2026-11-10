---
'@pipeline-view/react': minor
---

Add `<PipelineView>` (SSR-safe and StrictMode-safe; a ref and `onReady` expose the Diagram; a controlled `model` with no reload loop; `mode` / `theme` / `symbols` / `renderers` props; event props for every DiagramEvent) and React overlay renderers mounted through portals, so they keep the host's context. Hooks: `useDiagram`, `useDiagramEvent`, `useSelection`, `useViewport`, `useHistory`.
