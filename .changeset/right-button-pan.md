---
'@vespenelabs/pipeline-view': minor
---

Mouse buttons now mean the same in view and edit mode: the left button selects, and the right button pans (as the middle button and Space + drag already did).

- **Right-button drag pans** in both modes, from anywhere on the diagram. A right click that doesn't move still raises `contextMenu`, now on the release. The browser's own context menu no longer opens over the diagram, unless the viewport is locked.
- **A left-button drag on the background in view mode draws a selection box** and no longer pans. Shift adds to the selection. A touch drag still pans.
- New option `primaryDrag: 'select' | 'pan'`. Pass `'pan'` to keep the previous view-mode behaviour, where a left drag moves the view.
