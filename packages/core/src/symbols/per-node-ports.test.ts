import { afterEach, describe, expect, it, vi } from 'vitest';
import { Diagram } from '../diagram/diagram';
import type { DiagramModel, NodeModel } from '../model/types';
import { nodePorts, nodeSize, sidePorts } from './resolve';
import type { SymbolDef } from './types';

/** A manifold whose inlet/outlet counts come from node.data, and whose height grows with the busier side. */
const manifold: SymbolDef = {
  type: 'test/manifold',
  name: 'Manifold',
  category: 'Test',
  size: (n) => {
    const d = (n.data ?? {}) as { inputs?: number; outputs?: number };
    const busiest = Math.max(d.inputs ?? 1, d.outputs ?? 1);
    return { width: 40, height: Math.max(48, (busiest + 1) * 32) };
  },
  ports: (n) => {
    const d = (n.data ?? {}) as { inputs?: number; outputs?: number };
    const size = nodeSize(manifold, n);
    return [
      ...sidePorts(size, 'left', d.inputs ?? 1, { idPrefix: 'in-', role: 'in', labels: true }),
      ...sidePorts(size, 'right', d.outputs ?? 1, { idPrefix: 'out-', role: 'out' }),
    ];
  },
  svg: '<rect width="40" height="48"/>',
};

const pump: SymbolDef = {
  type: 'test/pump',
  name: 'Pump',
  category: 'Test',
  size: { width: 40, height: 40 },
  ports: [
    { id: 'in', position: { x: 0, y: 20 }, direction: 'left' },
    { id: 'out', position: { x: 40, y: 20 }, direction: 'right' },
  ],
};

const model = (): DiagramModel => ({
  version: 2,
  nodes: [
    { id: 'p1', type: 'test/pump', position: { x: 0, y: 0 } },
    { id: 'p2', type: 'test/pump', position: { x: 0, y: 200 } },
    { id: 'm', type: 'test/manifold', position: { x: 200, y: 0 }, data: { inputs: 3, outputs: 1 } },
  ],
  links: [
    {
      id: 'a',
      from: { node: 'p1', port: 'out' },
      to: { node: 'm', port: 'in-1' },
      kind: 'process',
    },
    {
      id: 'c',
      from: { node: 'p2', port: 'out' },
      to: { node: 'm', port: 'in-3' },
      kind: 'process',
    },
    // Already pointing at a port that doesn't exist: never touched by pruning.
    {
      id: 'legacy',
      from: { node: 'p2', port: 'out' },
      to: { node: 'm', port: 'nozzle-x' },
      kind: 'process',
    },
  ],
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('sidePorts', () => {
  it('spreads ports evenly along a side, with ids, labels and shared fields', () => {
    expect(
      sidePorts({ width: 40, height: 120 }, 'left', 3, {
        idPrefix: 'in-',
        labels: true,
        role: 'in',
        maxLinks: 1,
      }),
    ).toEqual([
      {
        id: 'in-1',
        position: { x: 0, y: 30 },
        direction: 'left',
        role: 'in',
        maxLinks: 1,
        label: '1',
      },
      {
        id: 'in-2',
        position: { x: 0, y: 60 },
        direction: 'left',
        role: 'in',
        maxLinks: 1,
        label: '2',
      },
      {
        id: 'in-3',
        position: { x: 0, y: 90 },
        direction: 'left',
        role: 'in',
        maxLinks: 1,
        label: '3',
      },
    ]);
  });

  it('centres ports at a fixed spacing and handles other sides', () => {
    const ports = sidePorts({ width: 100, height: 20 }, 'bottom', 2, { spacing: 20 });
    expect(ports.map((p) => [p.id, p.position])).toEqual([
      ['bottom-1', { x: 40, y: 20 }],
      ['bottom-2', { x: 60, y: 20 }],
    ]);
    expect(sidePorts({ width: 10, height: 10 }, 'top', 0)).toEqual([]);
  });
});

describe('nodePorts / nodeSize', () => {
  it('computes once per node object and recomputes for a new object', () => {
    const spy = vi.fn(() => [{ id: 'x', position: { x: 0, y: 0 }, direction: 'left' as const }]);
    const def: SymbolDef = { ...pump, type: 'test/spy', ports: spy };
    const n: NodeModel = { id: 'n', type: 'test/spy', position: { x: 0, y: 0 } };
    nodePorts(def, n);
    nodePorts(def, n);
    expect(spy).toHaveBeenCalledTimes(1);
    nodePorts(def, { ...n });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('drops duplicate computed port ids with one warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const def: SymbolDef = {
      ...pump,
      type: 'test/dupes',
      ports: () => [
        { id: 'a', position: { x: 0, y: 0 }, direction: 'left' },
        { id: 'a', position: { x: 0, y: 9 }, direction: 'left' },
      ],
    };
    expect(nodePorts(def, { id: 'n', type: 'test/dupes', position: { x: 0, y: 0 } })).toHaveLength(
      1,
    );
    nodePorts(def, { id: 'n2', type: 'test/dupes', position: { x: 0, y: 0 } });
    expect(warn).toHaveBeenCalledOnce();
  });

  it('evaluates against a data-less preview node outside a diagram', () => {
    expect(nodeSize(manifold)).toEqual({ width: 40, height: 64 });
    expect(nodePorts(manifold).map((p) => p.id)).toEqual(['in-1', 'out-1']);
  });
});

describe('removing ports removes their links in the same transaction', () => {
  const setup = () => {
    const d = new Diagram({ symbols: [manifold, pump] });
    d.load(model());
    return d;
  };

  it('removes links on lost ports as one undo step and reports them in the diff', () => {
    const d = setup();
    const onChange = vi.fn();
    d.on('modelChange', onChange);
    d.update((tx) => tx.updateNode('m', { data: { inputs: 2, outputs: 1 } }));
    expect([...d.store.links.keys()].sort()).toEqual(['a', 'legacy']);
    const { diff } = onChange.mock.calls[0]![0];
    expect(diff.changed.nodes).toEqual(['m']);
    expect(diff.removed.links).toEqual(['c']);
    d.undo();
    expect(d.toJSON()).toEqual(model());
  });

  it('also prunes when the per-node ports override changes', () => {
    const d = setup();
    d.update((tx) =>
      tx.updateNode('m', { ports: [{ id: 'in-3', position: { x: 0, y: 10 }, direction: 'left' }] }),
    );
    expect([...d.store.links.keys()].sort()).toEqual(['c', 'legacy']);
  });

  it('leaves links alone when ports only move', () => {
    const d = setup();
    d.update((tx) => tx.updateNode('m', { data: { inputs: 3, outputs: 4 } }));
    expect(d.store.links.size).toBe(3);
  });

  it('lets the editor connect to per-node ports', async () => {
    const { EditorCommands } = await import('../editor/commands');
    const d = setup();
    const ed = new EditorCommands(d, {
      bounds: (n) => ({ ...n.position, width: 40, height: 40 }),
      port: () => undefined,
    });
    const targets = ed.compatiblePorts({ node: 'p2', port: 'in' }).filter((t) => t.node === 'm');
    // Roles and maxLinks aren't enforced until FR-41: every per-node port is offered.
    expect(targets.map((t) => t.port)).toEqual(['in-1', 'in-2', 'in-3', 'out-1']);
  });
});

describe('controlled mode (FR-44) never prunes', () => {
  it('applies a host patch exactly, even when it keeps a link on a removed port', () => {
    const d = new Diagram({ symbols: [manifold, pump] });
    d.load(model());
    const target = model();
    target.nodes[2]!.data = { inputs: 2, outputs: 1 };
    // The host still has link c on in-3: its document is the truth.
    d.patch(target);
    expect(d.toJSON()).toEqual(target);
  });

  it('replays host history entries that already carry the pruned links', () => {
    const entries: { forward: unknown; inverse: unknown }[] = [];
    let at = 0;
    const history = {
      push: (e: never) => {
        entries.splice(at);
        entries.push(e);
        at = entries.length;
      },
      undo: () => (at > 0 ? (entries[--at] as never) : undefined),
      redo: () => (at < entries.length ? (entries[at++] as never) : undefined),
    };
    const d = new Diagram({ symbols: [manifold, pump], history });
    d.load(model());
    d.update((tx) => tx.updateNode('m', { data: { inputs: 2, outputs: 1 } }));
    expect(d.store.links.has('c')).toBe(false);
    expect(JSON.stringify(entries[0]!.forward)).toContain('"removed":["c"]');
    d.undo();
    // Patches carry no item order, so compare links by id (order is not part of host history).
    const byId = (m: DiagramModel) => ({
      ...m,
      links: [...m.links].sort((x, y) => x.id.localeCompare(y.id)),
    });
    expect(byId(d.toJSON())).toEqual(byId(model()));
    d.redo();
    expect([...d.store.links.keys()].sort()).toEqual(['a', 'legacy']);
  });
});

describe('rendering per-node ports', () => {
  it('redraws ports, unrotated labels and reroutes attached links when data changes the size', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const d = new Diagram({ symbols: [manifold, pump] });
    d.load(model());
    d.mount(container);
    d.renderer!.flush();
    const portIds = () =>
      [...container.querySelectorAll('[data-node-id="m"] .pv-port')].map(
        (p) => (p as SVGElement).dataset.portId,
      );
    expect(portIds()).toEqual(['in-1', 'in-2', 'in-3', 'out-1']);
    expect(
      [...container.querySelectorAll('[data-node-id="m"] > .pv-port-label')].map(
        (t) => t.textContent,
      ),
    ).toEqual(['1', '2', '3']);
    d.update((tx) =>
      tx.addLink({
        id: 'o',
        from: { node: 'm', port: 'out-1' },
        to: { node: 'p1', port: 'in' },
        kind: 'process',
      }),
    );
    d.renderer!.flush();
    const before = d.getLinkPath('o')!;
    expect(before[0]).toEqual({ x: 240, y: 64 });

    d.update((tx) => tx.updateNode('m', { data: { inputs: 5, outputs: 1 } }));
    d.renderer!.flush();
    expect(portIds()).toEqual(['in-1', 'in-2', 'in-3', 'in-4', 'in-5', 'out-1']);
    // Taller node (192 instead of 128): out-1 moved down to the middle, and link 'o' was rerouted.
    expect(d.getLinkPath('o')![0]).toEqual({ x: 240, y: 96 });
    d.destroy();
  });
});
