import { describe, expect, expectTypeOf, it } from 'vitest';
import type { LinkEnd } from '../model/types';
import type { SymbolDef } from '../symbols/types';
import { Diagram } from './diagram';
import type { ConnectResult, DiagramEvents, RefusalContext, RefusalEnds } from './types';

const valve: SymbolDef = {
  type: 't/valve',
  name: 'Valve',
  category: 'T',
  size: { width: 40, height: 20 },
  ports: [
    { id: 'in', position: { x: 0, y: 10 }, direction: 'left', role: 'in' },
    { id: 'out', position: { x: 40, y: 10 }, direction: 'right', role: 'out', maxLinks: 1 },
  ],
  svg: '<rect width="40" height="20"/>',
};

type Refusal = Extract<ConnectResult, { ok: false }>;

describe('ConnectResult refusal ends (FR-54)', () => {
  it('types: the refusal carries the same ends as connectRejected and RefusalContext', () => {
    expectTypeOf<Refusal['from']>().toEqualTypeOf<LinkEnd | undefined>();
    expectTypeOf<Refusal['to']>().toEqualTypeOf<LinkEnd | undefined>();
    expectTypeOf<Refusal['dragFrom']>().toEqualTypeOf<LinkEnd | undefined>();
    expectTypeOf<Refusal['dragTo']>().toEqualTypeOf<LinkEnd | undefined>();
    expectTypeOf<DiagramEvents['connectRejected']>().toMatchTypeOf<RefusalEnds>();
    expectTypeOf<RefusalContext>().toMatchTypeOf<RefusalEnds>();
    // Additive: a success result is unchanged.
    expectTypeOf<Extract<ConnectResult, { ok: true }>>().toEqualTypeOf<{ ok: true; id: string }>();
  });

  it('returns the ends in flow order, and the argument order when it differed', () => {
    const d = new Diagram({ symbols: [valve] });
    d.load({
      version: 2,
      nodes: [
        { id: 'a', type: 't/valve', position: { x: 0, y: 0 } },
        { id: 'b', type: 't/valve', position: { x: 200, y: 0 } },
        { id: 'c', type: 't/valve', position: { x: 400, y: 0 } },
      ],
      links: [
        {
          id: 'ab',
          from: { node: 'a', port: 'out' },
          to: { node: 'b', port: 'in' },
          kind: 'process',
        },
      ],
    });
    // Passed inlet first: a.out is full (maxLinks 1), so it's refused, reported outlet → inlet.
    const r = d.connect({ node: 'c', port: 'in' }, { node: 'a', port: 'out' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('port-full');
    expect(r.from).toEqual({ node: 'a', port: 'out' });
    expect(r.to).toEqual({ node: 'c', port: 'in' });
    expect(r.dragFrom).toEqual({ node: 'c', port: 'in' });
    expect(r.dragTo).toEqual({ node: 'a', port: 'out' });

    // Passed in flow order: no drag order.
    const r2 = d.connect({ node: 'a', port: 'out' }, { node: 'c', port: 'in' });
    expect(r2).toMatchObject({ ok: false, from: { node: 'a' }, to: { node: 'c' } });
    expect(r2).not.toHaveProperty('dragFrom');
    d.destroy();
  });
});
