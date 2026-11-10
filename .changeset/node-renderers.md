---
'@vespenelabs/pipeline-view': minor
---

React node renderers (FR-45): `<PipelineView nodeRenderers={{ 'app/card': Card }}>` renders a React component inside each node of that type.

- The component receives `{ node, data, status, selected, ports }`.
- The library still draws the ports, the selection box and the routes, and SVG symbols and React nodes can be mixed.
- Each node re-renders only when its own data, status or selection changes (a memo per node).
- `{ component, sizing: 'content' }` sizes the node from its content (ResizeObserver). Bounds and routes follow the measured size, and ports scale from the symbol's declared size. Measuring is view state: no modelChange, no undo step.
- Core gains the matching `nodeRenderers` option, with plain `HtmlRenderer`s, for non-React hosts.
