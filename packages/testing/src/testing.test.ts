import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiagramModel, SymbolDef } from '@pipeline-view/core';
import {
  click,
  connect,
  createTestDiagram,
  drag,
  drop,
  expectLink,
  findLinks,
  getNodeByLabel,
  getNodeElement,
  getPort,
  pressKey,
  type TestDiagram,
} from './index';

const valve: SymbolDef = {
  type: 'test/valve',
  name: 'Valve',
  category: 'Valves',
  size: { width: 40, height: 20 },
  ports: [
    { id: 'in', position: { x: 0, y: 10 }, direction: 'left' },
    { id: 'out', position: { x: 40, y: 10 }, direction: 'right' },
    { id: 'sig', position: { x: 20, y: 0 }, direction: 'top', accepts: ['signal'] },
  ],
  svg: '<rect width="40" height="20"/>',
};

const model: DiagramModel = {
  version: 1,
  nodes: [
    { id: 'a', type: 'test/valve', position: { x: 0, y: 100 }, label: 'Inlet' },
    { id: 'b', type: 'test/valve', position: { x: 200, y: 100 }, label: 'Outlet' },
    { id: 'c', type: 'test/valve', position: { x: 400, y: 100 }, label: 'Dup' },
    { id: 'd', type: 'test/valve', position: { x: 400, y: 300 }, label: 'Dup' },
  ],
  links: [
    { id: 'ab', from: { node: 'a', port: 'out' }, to: { node: 'b', port: 'in' }, kind: 'process' },
  ],
  annotations: [],
};

let t: TestDiagram;
beforeEach(() => {
  t = createTestDiagram({ model, symbols: [valve] });
});
afterEach(() => t.destroy());

describe('createTestDiagram', () => {
  it('mounts, loads and renders synchronously with stable data-pv-* ids', () => {
    const root = t.diagram.view!.root;
    expect(t.container.isConnected).toBe(true);
    expect(root.querySelectorAll('[data-pv-node-id]')).toHaveLength(4);
    expect(root.querySelector('[data-pv-link-id="ab"]')).not.toBeNull();
    expect(root.querySelectorAll('[data-pv-node-id="a"] [data-pv-port-id]')).toHaveLength(3);
    expect(t.diagram.getMode()).toBe('edit');
  });

  it('destroy removes the container it created', () => {
    const c = t.container;
    t.destroy();
    expect(c.isConnected).toBe(false);
    t = createTestDiagram();
  });
});

describe('queries', () => {
  it('getNodeByLabel finds one node and explains misses', () => {
    expect(getNodeByLabel(t, 'Outlet').id).toBe('b');
    expect(() => getNodeByLabel(t, 'Nope')).toThrow(/No node with label "Nope".*"Inlet"/);
    expect(() => getNodeByLabel(t, 'Dup')).toThrow(/2 nodes have label "Dup": c, d/);
  });

  it('getPort returns the definition, point and element', () => {
    const p = getPort(t, 'b.in');
    expect(p.def.direction).toBe('left');
    expect(p.point).toEqual({ x: 200, y: 110 });
    expect(p.element.getAttribute('data-pv-port-id')).toBe('in');
    expect(getPort(t, 'b', 'out').point).toEqual({ x: 240, y: 110 });
    expect(() => getPort(t, 'b.nope')).toThrow(/no port "nope". Ports: in, out, sig/);
  });

  it('expectLink matches ports or whole nodes and lists links on failure', () => {
    expect(expectLink(t, 'a.out', 'b.in').id).toBe('ab');
    expect(expectLink(t, 'a', 'b', { kind: 'process' }).id).toBe('ab');
    expect(() => expectLink(t, 'b', 'a')).toThrow(/found 0[\s\S]*ab: a\.out → b\.in \(process\)/);
    expect(expectLink(t, 'b', 'a', { undirected: true }).id).toBe('ab');
    expect(() => expectLink(t, 'a', 'c', { count: 0 })).not.toThrow();
  });
});

describe('actions', () => {
  it('connect drags a link between two ports', () => {
    const id = connect(t, 'b.out', 'c.in');
    expect(id).not.toBeNull();
    expect(expectLink(t, 'b.out', 'c.in').id).toBe(id);
    // It went through the editor, so it is one undo step.
    t.diagram.undo();
    expect(findLinks(t, 'b', 'c')).toHaveLength(0);
  });

  it('connect returns null when the ports are incompatible, and honours the kind', () => {
    expect(connect(t, 'b.out', 'c.sig')).toBeNull();
    const id = connect(t, 'b.out', 'c.sig', { kind: 'signal' });
    expect(expectLink(t, 'b.out', 'c.sig', { kind: 'signal' }).id).toBe(id);
  });

  it('connect respects canConnect', () => {
    t.destroy();
    t = createTestDiagram({ model, symbols: [valve], canConnect: () => false });
    expect(connect(t, 'b.out', 'c.in')).toBeNull();
  });

  it('drag moves a node through the pointer, emitting modelChange', () => {
    const changes = vi.fn();
    t.diagram.on('modelChange', changes);
    drag(t, 'c', { by: { x: 0, y: 50 } });
    expect(t.diagram.store.nodes.get('c')!.position).toEqual({ x: 400, y: 150 });
    drag(t, 'c', { to: { x: 500, y: 200 } });
    expect(t.diagram.store.nodes.get('c')!.position).toEqual({ x: 500, y: 200 });
    expect(changes).toHaveBeenCalledTimes(2);
  });

  it('drop adds a node at a diagram point', () => {
    const id = drop(t, 'test/valve', { x: 600, y: 410 })!;
    const n = t.diagram.store.nodes.get(id)!;
    // Dropped centred on the point.
    expect(n.position).toEqual({ x: 580, y: 400 });
    expect(getNodeElement(t, id)).toBeTruthy();
  });

  it('click selects; pressKey deletes and undoes', () => {
    click(t, { node: 'c' });
    expect(t.diagram.getSelection()).toEqual([{ kind: 'node', id: 'c' }]);
    pressKey(t, 'Delete');
    expect(t.diagram.store.nodes.has('c')).toBe(false);
    pressKey(t, 'z', { ctrlKey: true });
    expect(t.diagram.store.nodes.has('c')).toBe(true);
  });

  it('click on a link fires linkClick', () => {
    const onLink = vi.fn();
    t.diagram.on('linkClick', onLink);
    click(t, { link: 'ab' });
    expect(onLink).toHaveBeenCalledWith(
      expect.objectContaining({ item: { kind: 'link', id: 'ab' } }),
    );
  });

  it('edit actions explain when the editor or edit mode is missing', () => {
    t.diagram.setMode('view');
    expect(() => connect(t, 'b.out', 'c.in')).toThrow(/needs edit mode/);
    t.destroy();
    t = createTestDiagram({ model, symbols: [valve], editor: false });
    expect(() => drag(t, 'a', { by: { x: 1, y: 1 } })).toThrow(/needs the editor/);
  });
});
