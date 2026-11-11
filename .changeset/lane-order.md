---
'@vespenelabs/pipeline-view': patch
---

Parallel links that share a corridor now get nested lanes instead of reversed ones. Before, a stack of manifold outputs turning the same way gave the topmost output the outermost lane, so every pipe crossed the ones below it and got line jumps. After lanes are spread, the router now swaps lanes within each bundle while that reduces crossings, keeping every obstacle and lane rule. On the reported 8-output scene the crossings drop from 12 to 0, at the default spacing and at spacing 14.
