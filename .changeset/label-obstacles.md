---
'@vespenelabs/pipeline-view': minor
---

Links now route around node labels as well as node bodies, so a trunk no longer runs straight through the text under a symbol (for example in a column of labelled instruments). The label's box is estimated from its text, so there's no layout read, and pipes keep a small margin from it. It follows label edits and node moves, and works with the routing worker. A node's own pipe that leaves from directly under its label can still cross it. Set `routeAroundLabels: false` to route as before.
