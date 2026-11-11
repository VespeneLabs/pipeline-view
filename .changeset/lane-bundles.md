---
'@vespenelabs/pipeline-view': patch
---

Lane ordering now handles fans that turn both ways. In 1.5.0 a header whose outlets fan out up and down could still put two links on one vertical run, drawn with junction dots as if they were a tee, and its downward bundle could cross itself. Parallel segments of different links now form a bundle whenever their spans overlap with no node between them, even when they started on different lanes. Each bundle gets the order with the fewest crossings: its own lanes, or lanes packed against either side within how far each segment can move. Members never share a lane on overlapping spans, and crossings with other links nearby count too. On the reported 8-outlet header drawing, crossings and junction dots drop from 4 and 4 to 0.
