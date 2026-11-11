import { describe, expectTypeOf, it } from 'vitest';
import type { NodeModel } from '../model/types';
import { SymbolRegistry, registerSymbol } from './registry';
import type { SymbolDef } from './types';

interface ManifoldData extends Record<string, unknown> {
  inlets?: number;
}

const manifold: SymbolDef<ManifoldData> = {
  type: 'test/typed-manifold',
  name: 'Typed manifold',
  category: 'Test',
  size: (node) => {
    expectTypeOf(node).toEqualTypeOf<NodeModel<ManifoldData>>();
    return { width: 20, height: 20 * (node.data?.inlets ?? 1) };
  },
  ports: (node) =>
    Array.from({ length: node.data?.inlets ?? 1 }, (_, i) => ({
      id: `in${i}`,
      position: { x: 0, y: 10 + 20 * i },
      direction: 'left' as const,
    })),
  render: (ctx) => {
    expectTypeOf(ctx.data.inlets).toEqualTypeOf<number | undefined>();
    return '';
  },
};

describe('SymbolDef<D> typing (B1)', () => {
  it('passes NodeModel<D> to size/ports and accepts typed defs without casts', () => {
    const list: SymbolDef[] = [manifold];
    new SymbolRegistry().register(manifold);
    expectTypeOf(registerSymbol).toBeCallableWith(manifold);
    expectTypeOf(list).toEqualTypeOf<SymbolDef[]>();
  });
});
