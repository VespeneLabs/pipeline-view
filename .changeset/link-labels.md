---
'@vespenelabs/pipeline-view': minor
---

Links can carry a text label: `{ ..., label: 'Leak found' }`, for example the answers on a flowchart's arrows. The label follows the route and sits on the middle of the longest segment whose label box stays off nodes. When the route hugs nodes, it moves beside the line instead. A halo in the background color keeps it readable over crossings and line jumps. `labelPosition` (0..1) places it by fraction of the path length instead. The label becomes part of the link's `aria-label` ("Yes, Leak test to Report leak"). It's themed through `.pv-link-label` and the new `--pv-link-label-ink` / `--pv-link-label-bg` tokens, and it's hidden below the label zoom threshold like node labels.

Model: links can carry the optional `label` and `labelPosition`. The model version stays 2.
