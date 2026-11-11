---
'@vespenelabs/pipeline-view': minor
---

New `DiagramOptions.mergeJunctions` (default `true`, so nothing changes). With `false`, no junction dot is drawn where every link meeting at a point ends on the same node and port, or every one starts from the same node and port. Several arrows into one flowchart step then no longer read as a tee. Links with different ends that share a trunk keep their dot, and line jumps are unaffected.
