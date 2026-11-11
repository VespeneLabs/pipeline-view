---
'@vespenelabs/pipeline-view': minor
---

Editing for link ends attached to another link.

`linkAttach: true` lets the user draw a connection onto a link in edit mode. Dropping a connection on a link creates a link whose end is attached where it was dropped; the landing point is marked while dragging, and a port or node body under the pointer still wins. Keyboard connect (`C`) lists links after ports and attaches at the middle of the chosen link. A drag from an inlet gives a link that flows out of the host link (`fromAttach`, with `from` taken from the host link); any other port gives one that flows into it (`toAttach`, with `to` taken from the host link).

`resolveAttach(proposal)` sees the link before it is validated and may return a changed proposal (other ends, such as a dedicated side port on the same node, or another `at`), `null` to not offer an attachment on that link, or nothing to keep it. The usual connection rules then run on the result, and `canConnect` gets a fourth argument, `ctx.attach = { end, link, at }`. An attached end doesn't land on its port, so it is exempt from the port's `maxLinks` and is not counted against it later; a locked or missing host link refuses with `attach-locked` / `attach-missing-link`.

A selected link with an attached end shows a round handle on it (`.pv-attach-handle`). Dragging the handle, or pressing the arrow keys (Shift for a grid step), slides the end along the host link. Each move is one undo step, arrives in `modelChange.patch` as a changed link and is announced to screen readers; `attachMessages.moved` phrases or localizes the announcement.

`diagram.connect(from, to, kind, { fromAttach?, toAttach? })` creates an attached link from code, and `validateConnect` takes the same attachments as a sixth argument.
