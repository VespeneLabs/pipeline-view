/** Minimal typed event emitter. A throwing handler doesn't stop the other handlers; its error is rethrown asynchronously. */
export class Emitter<E extends object> {
  private readonly handlers = new Map<keyof E, Set<(payload: never) => void>>();

  on<K extends keyof E>(event: K, handler: (payload: E[K]) => void): () => void {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(handler as (payload: never) => void);
    return () => {
      set.delete(handler as (payload: never) => void);
    };
  }

  /** True when at least one handler is listening. Lets callers skip building expensive payloads. */
  has(event: keyof E): boolean {
    return (this.handlers.get(event)?.size ?? 0) > 0;
  }

  emit<K extends keyof E>(event: K, payload: E[K]): void {
    const set = this.handlers.get(event);
    if (!set || set.size === 0) return;
    for (const h of [...set]) {
      try {
        (h as (p: E[K]) => void)(payload);
      } catch (err) {
        queueMicrotask(() => {
          throw err;
        });
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
