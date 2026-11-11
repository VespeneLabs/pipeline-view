---
'@vespenelabs/pipeline-view': minor
---

A link end can be drawn on another link: `LinkModel.fromAttach` / `toAttach: { link, at }`, where `link` is the host link's id and `at` is the place along its route as a fraction of its length (0 = start, 1 = end). This lets a side connection join a pipe at a point, or lines branch without a header symbol.

The attachment only changes the drawing. `from` / `to` still name the node and port the link logically runs to, so graph helpers, connection rules and the topology part of `getDiff` are unaffected. The end follows the host link when it re-routes, leaves it at a right angle and gets a junction dot (also with `mergeJunctions: false`), and the link gets `data-attached`. A link can be attached to an attached link. Deleting the host link removes the attachment from the links on it in the same undo step; an attachment to a missing link, or one that closes a loop, is ignored and the end is drawn on its port. `getDiff` counts attaching, detaching and moving along the host as `moved`.

`pointAlong(route, at)` and `fractionAlong(route, point)` convert between fractions and points of a route, and `attachCycle(links, id, host)` tells whether an attachment would close a loop. The model stays at version 2.
