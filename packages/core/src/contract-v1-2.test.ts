import { afterEach, describe, expect, it } from 'vitest';
import { Diagram } from './diagram/diagram';
import { EditorCommands } from './editor/commands';
import { nodeBounds, portPoint } from './diagram/geometry';
import { migrateModel } from './model/migrate';
import type { DiagramModel, NodeModel } from './model/types';
import { nodePorts, nodeSize, previewNode } from './symbols/resolve';
import type { SymbolDef } from './symbols/types';

/** A manifold whose outlet count and width come from node.data (FR-40). */
const manifold: SymbolDef = {
  type: 'test/manifold',
  name: 'Manifold',
  category: 'Test',
  size: (n) => ({ width: 40 * Number(n.data?.outlets ?? 2), height: 20 }),
  ports: (n) => [
    { id: 'in', position: { x: 0, y: 10 }, direction: 'left', role: 'in' },
    ...Array.from({ length: Number(n.data?.outlets ?? 2) }, (_, i) => ({
      id: `out${i + 1}`,
      position: { x: 40 * i + 20, y: 20 },
      direction: 'bottom' as const,
      role: 'out' as const,
      maxLinks: 1,
    })),
  ],
};

const node = (extra: Partial<NodeModel> = {}): NodeModel => ({
  id: 'm',
  type: 'test/manifold',
  position: { x: 0, y: 0 },
  ...extra,
});

describe('model v2', () => {
  it('migrates v1 documents on load and always writes v2', () => {
    const v1 = { version: 1, nodes: [], links: [] } as unknown as DiagramModel;
    const d = new Diagram();
    d.load(v1);
    expect(d.toJSON().version).toBe(2);
    expect(migrateModel(v1).version).toBe(2);
    expect(() => migrateModel({ version: 3 } as unknown as DiagramModel)).toThrow(/version 3/);
  });

  it('round-trips the v2 fields (ports override, locked)', () => {
    const m: DiagramModel = {
      version: 2,
      nodes: [
        node({ ports: [{ id: 'x', position: { x: 1, y: 1 }, direction: 'top' }], locked: true }),
      ],
      links: [],
    };
    const d = new Diagram({ symbols: [manifold] });
    d.load(m);
    expect(d.toJSON()).toEqual(m);
  });
});

describe('per-node ports and size (FR-40)', () => {
  it('evaluates function ports/size per node; node.ports overrides', () => {
    expect(nodeSize(manifold, node({ data: { outlets: 3 } }))).toEqual({ width: 120, height: 20 });
    expect(nodePorts(manifold, node({ data: { outlets: 3 } })).map((p) => p.id)).toEqual([
      'in',
      'out1',
      'out2',
      'out3',
    ]);
    expect(nodePorts(manifold, node({ ports: [] }))).toEqual([]);
    // Palettes and galleries evaluate symbols without a diagram node.
    expect(nodeSize(manifold, previewNode(manifold)).width).toBe(80);
  });

  it('drives geometry: bounds and port points', () => {
    const n = node({ data: { outlets: 4 } });
    expect(nodeBounds(n, manifold).width).toBe(160);
    expect(portPoint(n, manifold, 'out4')?.point).toEqual({ x: 140, y: 20 });
    expect(portPoint(node(), manifold, 'out4')).toBeUndefined();
  });
});

describe('renderer with per-node ports', () => {
  let container: HTMLDivElement | undefined;
  afterEach(() => container?.remove());

  it('re-renders port circles when a node’s ports change', () => {
    container = document.createElement('div');
    document.body.append(container);
    const d = new Diagram({ symbols: [manifold] });
    d.load({ version: 2, nodes: [node({ data: { outlets: 2 } })], links: [] });
    d.mount(container);
    d.renderer!.flush();
    const ports = () =>
      [...container!.querySelectorAll('[data-node-id="m"] .pv-port')].map(
        (c) => (c as SVGElement).dataset.portId,
      );
    expect(ports()).toEqual(['in', 'out1', 'out2']);
    d.update((tx) => tx.updateNode('m', { data: { outlets: 3 } }));
    d.renderer!.flush();
    expect(ports()).toEqual(['in', 'out1', 'out2', 'out3']);
    d.destroy();
  });
});

describe('validation results (FR-42)', () => {
  const setup = (
    canConnect: NonNullable<ConstructorParameters<typeof Diagram>[0]>['canConnect'],
  ) => {
    const d = new Diagram({ symbols: [manifold], canConnect });
    d.load({
      version: 2,
      nodes: [node(), node({ id: 'n2', position: { x: 200, y: 0 } })],
      links: [],
    });
    const cmd = new EditorCommands(d, {
      bounds: (n) => nodeBounds(n, manifold),
      port: (n, id) => portPoint(n, manifold, id),
    });
    return { d, cmd };
  };

  it('refuses on false and on { ok: false, reason }, allows on true', () => {
    const from = { node: 'm', port: 'out1' };
    const to = { node: 'n2', port: 'in' };
    expect(setup(() => false).cmd.connect(from, to)).toBeNull();
    const { d, cmd } = setup(() => ({ ok: false, reason: 'Not here', code: 'direction' }));
    expect(cmd.connect(from, to)).toBeNull();
    expect(d.toJSON().links).toHaveLength(0);
    expect(setup(() => true).cmd.connect(from, to)).not.toBeNull();
  });
});
