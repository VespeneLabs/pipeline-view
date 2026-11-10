import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Diagram } from '../diagram/diagram';
import { validateConnect } from '../diagram/validate';
import type { DiagramModel, LinkModel } from '../model/types';
import type { SymbolDef } from '../symbols/types';
import {
  connectedComponents,
  downstreamOf,
  findCycles,
  flowPath,
  topologicalOrder,
  upstreamOf,
} from './graph';

const link = (id: string, from: string, to: string, kind = 'process'): LinkModel => ({
  id,
  from: { node: from, port: 'out' },
  to: { node: to, port: 'in' },
  kind,
});
const nodes = (...ids: string[]) =>
  ids.map((id) => ({ id, type: 't/x', position: { x: 0, y: 0 } }));

// supply → A → B → C, A → D, plus a signal link C → supply and an unconnected E.
const model: DiagramModel = {
  version: 2,
  nodes: nodes('supply', 'A', 'B', 'C', 'D', 'E'),
  links: [
    link('1', 'supply', 'A'),
    link('2', 'A', 'B'),
    link('3', 'B', 'C'),
    link('4', 'A', 'D'),
    link('5', 'C', 'supply', 'signal'),
  ],
};
const process = { kinds: ['process'] };

describe('graph helpers', () => {
  it('walks upstream and downstream, filtered by kind', () => {
    expect(downstreamOf(model, 'A', process).sort()).toEqual(['B', 'C', 'D']);
    expect(upstreamOf(model, 'C', process)).toEqual(['B', 'A', 'supply']);
    // Following signal links too reaches back around the loop.
    expect(upstreamOf(model, 'supply').sort()).toEqual(['A', 'B', 'C']);
    expect(upstreamOf(model, 'missing')).toEqual([]);
  });

  it('stops at nodes where `through` returns false, but includes them', () => {
    expect(upstreamOf(model, 'C', { ...process, through: (n) => n.id !== 'B' })).toEqual(['B']);
  });

  it('orders nodes topologically, or returns null for a cycle', () => {
    const order = topologicalOrder(model, process)!;
    for (const l of model.links.filter((x) => x.kind === 'process')) {
      expect(order.indexOf(l.from.node)).toBeLessThan(order.indexOf(l.to.node));
    }
    expect(order).toHaveLength(6);
    expect(topologicalOrder(model)).toBeNull();
  });

  it('finds cycles (including self-loops) and connected components', () => {
    expect(findCycles(model, process)).toEqual([]);
    expect(findCycles(model).map((c) => [...c].sort())).toEqual([['A', 'B', 'C', 'supply']]);
    expect(findCycles({ nodes: nodes('x'), links: [link('s', 'x', 'x')] })).toEqual([['x']]);
    expect(connectedComponents(model, process).map((c) => [...c].sort())).toEqual([
      ['A', 'B', 'C', 'D', 'supply'],
      ['E'],
    ]);
  });

  it('finds a flow path', () => {
    expect(flowPath(model, 'supply', 'C', process)).toEqual(['supply', 'A', 'B', 'C']);
    expect(flowPath(model, 'C', 'A', process)).toBeNull();
  });

  it('topologicalOrder agrees with findCycles on random graphs', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.nat(7), fc.nat(7)), { maxLength: 14 }), (edges) => {
        const m = {
          nodes: nodes('0', '1', '2', '3', '4', '5', '6', '7'),
          links: edges.map(([a, b], i) => link(`l${i}`, String(a), String(b))),
        };
        expect(topologicalOrder(m) === null).toBe(findCycles(m).length > 0);
      }),
      { numRuns: 300 },
    );
  });
});

describe('graph rules in validateConnect (FR-49)', () => {
  const box: SymbolDef = {
    type: 't/x',
    name: 'X',
    category: 'Test',
    size: { width: 20, height: 20 },
    ports: [
      { id: 'in', position: { x: 0, y: 10 }, direction: 'left' },
      { id: 'in2', position: { x: 10, y: 20 }, direction: 'bottom' },
      { id: 'out', position: { x: 20, y: 10 }, direction: 'right' },
    ],
  };
  const setup = (opts: ConstructorParameters<typeof Diagram>[0]) => {
    const d = new Diagram({ symbols: [box], ...opts });
    d.load(model);
    return d;
  };
  const e = (node: string, port: string) => ({ node, port });

  it('refuses a link that would close a cycle, naming the loop', () => {
    const d = setup({ noCycles: { kinds: ['process'] } });
    expect(validateConnect(d, e('C', 'out'), e('supply', 'in2'), 'process')).toMatchObject({
      ok: false,
      code: 'cycle',
      detail: { cycleNodes: ['supply', 'A', 'B', 'C'] },
    });
    // Other kinds aren't checked, and forward links are fine.
    expect(validateConnect(d, e('C', 'out'), e('supply', 'in2'), 'signal').ok).toBe(true);
    expect(validateConnect(d, e('C', 'out'), e('E', 'in'), 'process').ok).toBe(true);
  });

  it('limits links between two nodes through any ports', () => {
    const d = setup({ maxLinksBetweenNodes: 1 });
    expect(validateConnect(d, e('A', 'out'), e('B', 'in2'), 'process')).toMatchObject({
      ok: false,
      code: 'max-links-between-nodes',
      detail: { nodes: ['A', 'B'], max: 1 },
    });
    expect(validateConnect(d, e('D', 'out'), e('E', 'in'), 'process').ok).toBe(true);
  });
});
