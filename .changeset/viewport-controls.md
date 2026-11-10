---
'@vespenelabs/pipeline-view': minor
---

Viewport controls and saving the view (FR-47):

- `<ViewportControls/>`: an accessible toolbar (zoom in/out, fit, reset, optional lock) placed in the diagram's corner, with overridable labels and styling through `--pv-*` tokens (`.pv-viewport-controls`).
- `initialViewport`, plus `fitOnLoad: 'always' | 'if-no-viewport' | 'never'` (default `'if-no-viewport'`). The fit waits until HTML and React content has rendered and been measured, and any viewport change before then cancels it. `<PipelineView fitOnLoad initialViewport>` delegates to these.
- `viewportChange` now carries `final`: true for instant programmatic changes, at the end of a drag or pinch, ~150 ms after the last wheel event, and on the last animation frame. Hosts can save the view once instead of on every frame.
- `diagram.lockViewport(locked)` / `isViewportLocked()` stop user pan and zoom (a locked wheel scrolls the page); programmatic changes still apply.
