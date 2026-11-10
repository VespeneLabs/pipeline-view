---
'@pipeline-view/core': minor
---

Accessibility and export. Nodes get `role="button"`, an `aria-label` (label or id, symbol name, status) and a roving tabindex. Keyboard: arrows move focus to the nearest node (Alt+arrows in edit mode), Home/End jump to the first/last node, Enter selects and emits nodeClick, Escape clears the selection, +/-/0 zoom. A focus ring is drawn with `--pv-focus-ring`. `exportSVG()` returns a standalone SVG (computed styles inlined, editing chrome removed, HTML overlays as foreignObject), and `exportPNG({ scale })` rasterizes it. Both can export the whole diagram or the visible viewport.
