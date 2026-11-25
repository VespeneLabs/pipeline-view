---
'@vespenelabs/pipeline-view': minor
---

Dragging a node now lines its ports up with the ports they are linked to, so the pipe between them can run straight.

Before this change, grid snap and alignment guides placed the node's box, not its ports. Ports sit at different places in different symbols, so two linked ports often ended a few units apart, and the router had to draw a small jog. Now, when a moved port comes within the guide snap distance (`guideThreshold`, default 6 screen pixels) of the port at the other end of its link, the node snaps so that the two ports line up. A guide shows along the straight pipe. Port alignment takes priority over box guides and over the grid on that axis.

The snap applies to auto-routed links whose two ports face each other (left and right, or top and bottom). It does not apply to manual links, to link ends attached to another link, to ports with a branch point, or to links between two nodes that move together.
