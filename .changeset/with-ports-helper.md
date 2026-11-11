---
'@vespenelabs/pipeline-view': minor
---

`withPorts(def, extra)` returns a copy of a symbol with extra ports, so a host can add a side port to an existing symbol without restating its ports: `registerSymbol(withPorts(gateValve, [{ id: 'side', position: { x: 20, y: 0 }, direction: 'top' }]))`. It works whether the symbol's ports are a list or a function of the node, `extra` may be a function of the node too, and an extra port with an existing id replaces that port.
