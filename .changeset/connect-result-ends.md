---
'@vespenelabs/pipeline-view': minor
---

`ConnectResult`'s refusal now declares what `diagram.connect()` already returned at runtime: `from` / `to` in flow order (outlet → inlet), and `dragFrom` / `dragTo` when the arguments were passed in the other order. TypeScript hosts can read them without a cast. They share the new exported `RefusalEnds` type with the `connectRejected` event and `RefusalContext`, so the three can't drift apart. Additive: existing code compiles unchanged.
