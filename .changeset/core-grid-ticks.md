---
'@pipeline-view/core': minor
---

Draw pneumatic signal links as solid lines with paired `//` tick marks (Figma reference #50; spacing set by `--pv-tick-spacing`, and `--pv-line-pneumatic-dash` now defaults to `none`). Signal-kind arrows and ticks use `--pv-line-signal`. Add the optional background grid (`grid: { size, visible: true }`), drawn in screen space with `--pv-grid`, following pan and zoom and hidden when denser than 6 px.
