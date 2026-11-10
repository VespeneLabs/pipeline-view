import type { SymbolDef } from './types';

/** Symbol registry. A global default instance exists, and each Diagram may layer instance-local symbols on top. */
export class SymbolRegistry {
  private readonly defs = new Map<string, SymbolDef>();

  constructor(private readonly parent?: SymbolRegistry) {}

  register(...defs: SymbolDef[]): void {
    for (const def of defs) {
      if (!def.type.includes('/')) {
        throw new Error(`Symbol type "${def.type}" must be namespaced, for example "acme/pump"`);
      }
      const ids = new Set<string>();
      // Dynamic port lists are validated when they're evaluated, not at registration.
      for (const p of Array.isArray(def.ports) ? def.ports : []) {
        if (ids.has(p.id)) throw new Error(`Symbol "${def.type}" has duplicate port id "${p.id}"`);
        ids.add(p.id);
      }
      this.defs.set(def.type, def);
    }
  }

  get(type: string): SymbolDef | undefined {
    return this.defs.get(type) ?? this.parent?.get(type);
  }

  has(type: string): boolean {
    return this.get(type) !== undefined;
  }

  list(): SymbolDef[] {
    const merged = new Map(this.parent?.list().map((d) => [d.type, d]));
    for (const [k, v] of this.defs) merged.set(k, v);
    return [...merged.values()];
  }
}

export const globalSymbols = new SymbolRegistry();

/** Register symbols globally (FR-7). */
export function registerSymbol(...defs: SymbolDef[]): void {
  globalSymbols.register(...defs);
}
