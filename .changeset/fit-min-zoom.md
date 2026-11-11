---
'@vespenelabs/pipeline-view': minor
---

Fitting can keep large drawings legible. `zoomToFit({ minZoom })`, and the new `fitMinZoom` option for fit-on-load and the fit button, set a floor for the fit zoom. When the whole diagram can't fit at that zoom, the view shows its top-left part and the user can pan to the rest. Manual zoom-out is still limited only by `minZoom`. Any fit whose content overflows (including at `minZoom`) now aligns to the top/left edge instead of centering, which used to cut off both ends.
