---
'@vespenelabs/pipeline-view': minor
---

Problem markers (FR-48):

- `diagram.setIssues({ nodes, links })` replaces every marker at once; `getIssues()` reads them back. Issues (`{ severity: 'error' | 'warning' | 'info', message, code? }`) are view state, so they are never saved with the model or exported.
- Each item with issues gets a badge in its own layer, at a node's top-right corner or at the middle of a link's route. The badge shows an icon for the worst severity and has a tooltip listing the messages; clicking it hits the item.
- The item itself gets `data-issue-severity` (worst severity) and an `aria-description` listing the messages, worst first.
- `diagram.nextIssue(1 | -1)` and F8 / Shift+F8 step through marked items in reading order. Each step selects the item, scrolls it into view, and focuses it if it's a node.
- `<PipelineView issues={…}>` applies the markers whenever the object's identity changes.
- New theme tokens: `--pv-issue-error`, `--pv-issue-warning`, `--pv-issue-info`, `--pv-issue-ink` and `--pv-issue-badge-ring`.
