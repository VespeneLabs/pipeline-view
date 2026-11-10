---
'@vespenelabs/pipeline-view': patch
---

A content-sized node whose size changes on a data tick no longer re-routes its links unless its ports actually move, or the resized node now covers a link's path. Live values in content-sized cards no longer cost a re-route per tick.
