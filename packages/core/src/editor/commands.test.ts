import { describe, expect, it, vi } from 'vitest';
import { Diagram } from '../diagram/diagram';
import type { DiagramOptions } from '../diagram/types';
import type { DiagramModel, LinkModel, NodeModel } from '../model/types';
import type { PortDef, SymbolDef } from '../symbols/types';
import { EditorCommands, type EditorGeometry } from './commands';

const valve: SymbolDef = {
  type: 'test/valve',
  name: 'Valve',
  category: 'Valves',
  size: { width: 40, height: 20 },
  ports: [
    { id: 'in', position: { x: 0, y: 10 }, direction: 'left', accepts: ['process'] },
    { id: 'out', position: { x: 40, y: 10 }, direction: 'right', accepts: ['process'] },
    { id: 'sig', position: { x: 20, y: 0 }, direction: 'top', accepts: ['signal'] },
  ],
};

/** Unrotated geometry is enough for these tests. */
const geometry: EditorGeometry = {
  bounds: (n) => ({ x: n.position.x, y: n.position.y, width: 40, height: 20 }),
  port: (n, id) => {
    const p = (valve.ports as PortDef[]).find((q) => q.id === id);
    return (
      p && {
        point: { x: n.position.x + p.position.x, y: n.position.y + p.position.y },
        direction: p.direction,
      }
    );
  },
};

const model = (): DiagramModel => ({
  version: 2,
  nodes: [
    { id: 'a', type: 'test/valve', position: { x: 0, y: 0 } },
    { id: 'b', type: 'test/valve', position: { x: 200, y: 100 } },
    { id: 'c', type: 'test/valve', position: { x: 400, y: 0 } },
  ],
  links: [
    {
      id: 'm',
      from: { node: 'a', port: 'out' },
      to: { node: 'b', port: 'in' },
      kind: 'process',
      routing: 'manual',
      waypoints: [
        { x: 100, y: 10 },
        { x: 100, y: 110 },
      ],
    },
  ],
  annotations: [
    { id: 't', kind: 'text', text: 'A', position: { x: 0, y: -10 }, anchor: { node: 'a' } },
  ],
});

function setup(options: DiagramOptions = {}) {
  const d = new Diagram({ symbols: [valve], ...options });
  d.load(model());
  return { d, ed: new EditorCommands(d, geometry) };
}

const node = (d: Diagram, id: string): NodeModel => d.store.nodes.get(id)!;

describe('move', () => {
  it('drags as a single undo step with grid snap', () => {
    const { d, ed } = setup({ grid: { size: 10, snap: true, visible: true } });
    const onChange = vi.fn();
    d.on('modelChange', onChange);
    ed.beginMove(['c'], 'c');
    ed.dragMove({ x: 3, y: 4 }, { guideThreshold: 0 });
    ed.dragMove({ x: 23, y: 47 }, { guideThreshold: 0 });
    expect(node(d, 'c').position).toEqual({ x: 420, y: 50 });
    ed.endMove();
    expect(onChange).toHaveBeenCalledTimes(1);
    d.undo();
    expect(node(d, 'c').position).toEqual({ x: 400, y: 0 });
  });

  it('snaps to alignment guides', () => {
    const { d, ed } = setup();
    ed.beginMove(['c'], 'c');
    const guides = ed.dragMove({ x: 0, y: 97 });
    // c's top (97) snaps to b's top (100).
    expect(node(d, 'c').position).toEqual({ x: 400, y: 100 });
    expect(guides).toContainEqual({ orientation: 'horizontal', pos: 100, from: 200, to: 440 });
    ed.cancelMove();
    expect(node(d, 'c').position).toEqual({ x: 400, y: 0 });
    expect(d.canUndo()).toBe(false);
  });

  it('slides the end waypoint of manual links attached to one moved node', () => {
    const { d, ed } = setup();
    ed.moveBy(['b'], { x: 0, y: 30 });
    expect(d.store.links.get('m')!.waypoints).toEqual([
      { x: 100, y: 10 },
      { x: 100, y: 140 },
    ]);
  });

  it('translates manual links when both ends move', () => {
    const { d, ed } = setup();
    ed.beginMove(['a', 'b'], 'a');
    ed.dragMove({ x: 10, y: 10 }, { guideThreshold: 0 });
    ed.dragMove({ x: 20, y: 0 }, { guideThreshold: 0 });
    ed.endMove();
    expect(d.store.links.get('m')!.waypoints).toEqual([
      { x: 120, y: 10 },
      { x: 120, y: 110 },
    ]);
  });
});

describe('port alignment while moving', () => {
  // A tank whose outlet sits low on its right side, and a valve whose inlet is at mid height:
  // box edges and centres never line the two ports up.
  const tank: SymbolDef = {
    type: 'test/tank',
    name: 'Tank',
    category: 'Tanks',
    size: { width: 60, height: 80 },
    ports: [
      { id: 'out', position: { x: 60, y: 53 }, direction: 'right' },
      { id: 'top', position: { x: 30, y: 0 }, direction: 'top' },
      { id: 'bottom', position: { x: 30, y: 80 }, direction: 'bottom' },
    ],
  };
  const defs: Record<string, SymbolDef> = { 'test/tank': tank, 'test/valve': valve };
  const geo: EditorGeometry = {
    bounds: (n) => ({
      ...n.position,
      ...(defs[n.type]!.size as { width: number; height: number }),
    }),
    port: (n, id) => {
      const p = (defs[n.type]!.ports as PortDef[]).find((q) => q.id === id);
      return (
        p && {
          point: { x: n.position.x + p.position.x, y: n.position.y + p.position.y },
          direction: p.direction,
        }
      );
    },
  };
  function scene(link: Partial<LinkModel> = {}, options: DiagramOptions = {}) {
    const d = new Diagram({ symbols: [valve, tank], ...options });
    d.load({
      version: 2,
      nodes: [
        { id: 't', type: 'test/tank', position: { x: 0, y: 0 } },
        { id: 'v', type: 'test/valve', position: { x: 200, y: 0 } },
        { id: 'w', type: 'test/tank', position: { x: 500, y: -200 } },
      ],
      links: [
        {
          id: 'l',
          from: { node: 't', port: 'out' },
          to: { node: 'v', port: 'in' },
          kind: 'process',
          ...link,
        },
      ],
      annotations: [],
    });
    return { d, ed: new EditorCommands(d, geo) };
  }

  it('lines the moved port up with the fixed one and draws a guide along the pipe', () => {
    const { d, ed } = scene();
    ed.beginMove(['v'], 'v');
    // The valve inlet would be at y = 30; the tank outlet is at y = 53.
    ed.dragMove({ x: 0, y: 20 });
    expect(node(d, 'v').position).toEqual({ x: 200, y: 20 });
    // Inlet at 58: 5 below the outlet, so it snaps up to it.
    const guides = ed.dragMove({ x: 0, y: 48 });
    expect(node(d, 'v').position).toEqual({ x: 200, y: 43 });
    expect(guides).toEqual([{ orientation: 'horizontal', pos: 53, from: 60, to: 200 }]);
    ed.endMove();
    expect(node(d, 'v').position).toEqual({ x: 200, y: 43 });
  });

  it('wins over the grid and over box guides on its axis', () => {
    const { d, ed } = scene({}, { grid: { size: 10, snap: true, visible: true } });
    ed.beginMove(['v'], 'v');
    // The grid and the box guide (valve top 44 on tank centre 40) both say y = 40; the port says 43.
    ed.dragMove({ x: 3, y: 44 });
    expect(node(d, 'v').position).toEqual({ x: 200, y: 43 });
    // No box guide in reach; the grid says 50, the port 43.
    ed.dragMove({ x: 3, y: 47 });
    expect(node(d, 'v').position).toEqual({ x: 200, y: 43 });
    // Moving the tank instead: its outlet lines up with the valve inlet (y = 10).
    ed.cancelMove();
    ed.beginMove(['t'], 't');
    ed.dragMove({ x: 2, y: -40 });
    expect(node(d, 't').position).toEqual({ x: 0, y: -43 });
  });

  it('lines up ports that face each other vertically on x', () => {
    const { d, ed } = scene({
      from: { node: 't', port: 'top' },
      to: { node: 'w', port: 'bottom' },
    });
    ed.beginMove(['w'], 'w');
    // w's bottom port at x = 530 - 503 + 4 = 31 sits 1 off the tank's top port (x = 30).
    const guides = ed.dragMove({ x: -499, y: 0 });
    expect(node(d, 'w').position.x).toBe(0);
    expect(guides).toContainEqual({ orientation: 'vertical', pos: 30, from: -120, to: 0 });
  });

  it('does not snap ports that face the same way', () => {
    const { d, ed } = scene({ from: { node: 't', port: 'top' }, to: { node: 'w', port: 'top' } });
    ed.beginMove(['w'], 'w');
    ed.dragMove({ x: -470, y: 0 });
    expect(node(d, 'w').position.x).toBe(30);
  });

  it('ignores manual links, links between two moved nodes, and branch points', () => {
    const cases: [Partial<LinkModel>, string[]][] = [
      [{ routing: 'manual', waypoints: [] }, ['v']],
      [{}, ['v', 't']],
    ];
    for (const [link, ids] of cases) {
      const { d, ed } = scene(link);
      ed.beginMove(ids, 'v');
      ed.dragMove({ x: 0, y: 48 });
      expect(node(d, 'v').position).toEqual({ x: 200, y: 48 });
    }
    const { d, ed } = scene();
    d.update((tx) => tx.updateNode('t', { branchPoints: { out: { x: 100, y: 50 } } }));
    ed.beginMove(['v'], 'v');
    ed.dragMove({ x: 0, y: 48 });
    expect(node(d, 'v').position).toEqual({ x: 200, y: 48 });
  });
});

describe('rotate / flip', () => {
  it('rotates clockwise, wraps, and resets attached manual links', () => {
    const { d, ed } = setup();
    ed.rotate(['a']);
    expect(node(d, 'a').rotation).toBe(90);
    expect(node(d, 'a').position).toEqual({ x: 0, y: 0 });
    expect(d.store.links.get('m')).not.toHaveProperty('waypoints');
    expect(d.store.links.get('m')).not.toHaveProperty('routing');
    ed.rotate(['a'], -90);
    ed.rotate(['a'], -90);
    expect(node(d, 'a').rotation).toBe(270);
    d.undo();
    d.undo();
    d.undo();
    expect(d.toJSON()).toEqual(model());
  });

  it('toggles flip without leaving false flags behind', () => {
    const { d, ed } = setup();
    ed.flip(['c'], 'x');
    expect(node(d, 'c').flipX).toBe(true);
    ed.flip(['c'], 'x');
    expect(node(d, 'c')).not.toHaveProperty('flipX');
  });
});

describe('delete / clipboard', () => {
  it('deletes the selection in one undo step', () => {
    const { d, ed } = setup();
    d.setSelection([{ kind: 'node', id: 'a' }]);
    ed.deleteItems();
    expect(d.store.nodes.has('a')).toBe(false);
    expect(d.store.links.size).toBe(0);
    d.undo();
    expect(d.toJSON()).toEqual(model());
  });

  it('copies nodes with internal links and anchored annotations, pastes with new ids', () => {
    const { d, ed } = setup();
    const clip = ed.copy([
      { kind: 'node', id: 'a' },
      { kind: 'node', id: 'b' },
    ]);
    expect(clip.links.map((l) => l.id)).toEqual(['m']);
    expect(clip.annotations.map((a) => a.id)).toEqual(['t']);
    const pasted = ed.paste(clip, { x: 0, y: 300 });
    expect(pasted).toEqual([
      { kind: 'node', id: 'a_1' },
      { kind: 'node', id: 'b_1' },
      { kind: 'link', id: 'm_1' },
      { kind: 'annotation', id: 't_1' },
    ]);
    expect(d.getSelection()).toEqual(pasted);
    const link = d.store.links.get('m_1')!;
    expect(link.from.node).toBe('a_1');
    expect(link.waypoints![0]).toEqual({ x: 100, y: 310 });
    expect(d.store.annotations.get('t_1')!.anchor).toEqual({ node: 'a_1' });
    expect(node(d, 'b_1').position).toEqual({ x: 200, y: 400 });
    // Duplicating a copy doesn't stack suffixes.
    d.setSelection([{ kind: 'node', id: 'a_1' }]);
    expect(ed.duplicate()).toEqual([
      { kind: 'node', id: 'a_2' },
      { kind: 'annotation', id: 't_2' },
    ]);
    d.undo();
    d.undo();
    expect(d.toJSON()).toEqual(model());
  });

  it('cut removes and returns the items', () => {
    const { d, ed } = setup();
    const clip = ed.cut([{ kind: 'node', id: 'c' }]);
    expect(clip.nodes).toHaveLength(1);
    expect(d.store.nodes.has('c')).toBe(false);
  });
});

describe('connect', () => {
  it('validates port kinds, duplicates and the canConnect hook', () => {
    const canConnect = vi.fn(() => true);
    const { ed } = setup({ canConnect });
    expect(ed.canConnect({ node: 'b', port: 'out' }, { node: 'c', port: 'in' })).toBe(true);
    expect(ed.canConnect({ node: 'b', port: 'out' }, { node: 'c', port: 'sig' })).toBe(false);
    expect(ed.canConnect({ node: 'b', port: 'out' }, { node: 'c', port: 'sig' }, 'signal')).toBe(
      false,
    );
    expect(ed.canConnect({ node: 'b', port: 'sig' }, { node: 'c', port: 'sig' }, 'signal')).toBe(
      true,
    );
    expect(ed.canConnect({ node: 'b', port: 'in' }, { node: 'a', port: 'out' })).toBe(false); // exists (reversed)
    expect(ed.canConnect({ node: 'b', port: 'out' }, { node: 'b', port: 'out' })).toBe(false);
    expect(ed.canConnect({ node: 'b', port: 'nope' }, { node: 'c', port: 'in' })).toBe(false);
    canConnect.mockReturnValue(false);
    expect(ed.canConnect({ node: 'b', port: 'out' }, { node: 'c', port: 'in' })).toBe(false);
  });

  it('lists compatible ports and connects', () => {
    const { d, ed } = setup();
    expect(ed.compatiblePorts({ node: 'c', port: 'sig' }, 'signal')).toEqual([
      { node: 'a', port: 'sig' },
      { node: 'b', port: 'sig' },
    ]);
    const id = ed.connect({ node: 'b', port: 'out' }, { node: 'c', port: 'in' });
    expect(id).toBe('process_1');
    expect(d.store.links.get(id!)).toEqual({
      id: 'process_1',
      from: { node: 'b', port: 'out' },
      to: { node: 'c', port: 'in' },
      kind: 'process',
    });
    expect(ed.connect({ node: 'b', port: 'out' }, { node: 'c', port: 'in' })).toBeNull();
  });
});

describe('links, drop, label, selection', () => {
  it('stores an edited path as manual waypoints and can reset it', () => {
    const { d, ed } = setup();
    ed.connect({ node: 'b', port: 'out' }, { node: 'c', port: 'in' });
    ed.setLinkPath('process_1', [
      { x: 240, y: 110 },
      { x: 300, y: 110 },
      { x: 300, y: 110 },
      { x: 300, y: 10 },
      { x: 400, y: 10 },
    ]);
    expect(d.store.links.get('process_1')).toMatchObject({
      routing: 'manual',
      waypoints: [
        { x: 300, y: 110 },
        { x: 300, y: 10 },
      ],
    });
    ed.resetRouting('process_1');
    expect(d.store.links.get('process_1')).not.toHaveProperty('waypoints');
  });

  it('previews a path drag as one undo step', () => {
    const { d, ed } = setup();
    ed.previewLinkPath('m', [
      { x: 40, y: 10 },
      { x: 120, y: 10 },
      { x: 120, y: 110 },
      { x: 200, y: 110 },
    ]);
    ed.previewLinkPath('m', [
      { x: 40, y: 10 },
      { x: 140, y: 10 },
      { x: 140, y: 110 },
      { x: 200, y: 110 },
    ]);
    ed.commitLinkPath();
    expect(d.store.links.get('m')!.waypoints![0]).toEqual({ x: 140, y: 10 });
    d.undo();
    expect(d.toJSON()).toEqual(model());
  });

  it('drops a symbol centered on the point, snapped, subject to canDrop', () => {
    const canDrop = vi.fn((_type: string, p: { x: number }) => p.x >= 0);
    const { d, ed } = setup({ canDrop, grid: { size: 10, snap: true, visible: false } });
    const id = ed.drop('test/valve', { x: 103, y: 57 });
    expect(id).toBe('valve_1');
    expect(node(d, id!).position).toEqual({ x: 80, y: 50 });
    expect(canDrop).toHaveBeenCalledWith('test/valve', { x: 80, y: 50 });
    expect(d.getSelection()).toEqual([{ kind: 'node', id: 'valve_1' }]);
    expect(ed.drop('test/valve', { x: -100, y: 0 })).toBeNull();
    expect(ed.drop('test/unknown', { x: 0, y: 0 })).toBeNull();
  });

  it('edits and clears labels', () => {
    const { d, ed } = setup();
    ed.setLabel('a', 'XV-101');
    expect(node(d, 'a').label).toBe('XV-101');
    ed.setLabel('a', '  ');
    expect(node(d, 'a')).not.toHaveProperty('label');
    d.undo();
    expect(node(d, 'a').label).toBe('XV-101');
  });

  it('selects all and finds nodes in a marquee', () => {
    const { d, ed } = setup();
    ed.selectAll();
    expect(d.getSelection()).toHaveLength(4);
    expect(ed.nodesInRect({ x: -10, y: -10, width: 230, height: 115 })).toEqual(['a', 'b']);
  });
});
