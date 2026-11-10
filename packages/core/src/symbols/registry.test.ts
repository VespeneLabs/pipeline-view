import { describe, expect, it } from 'vitest';
import { SymbolRegistry } from './registry';

const def = {
  type: 'test/a',
  name: 'A',
  category: 'Test',
  size: { width: 10, height: 10 },
  ports: [],
};

describe('SymbolRegistry', () => {
  it('registers and resolves through parent', () => {
    const parent = new SymbolRegistry();
    parent.register(def);
    const child = new SymbolRegistry(parent);
    expect(child.get('test/a')?.name).toBe('A');
    expect(child.list()).toHaveLength(1);
  });

  it('rejects non-namespaced types', () => {
    expect(() => new SymbolRegistry().register({ ...def, type: 'a' })).toThrow(/namespaced/);
  });
});
