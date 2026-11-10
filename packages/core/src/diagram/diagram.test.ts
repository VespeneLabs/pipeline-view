import { describe, expect, it, vi } from 'vitest';
import type { DiagramModel } from '../model/types';
import { Diagram } from './diagram';

const model = (): DiagramModel => ({
  version: 1,
  nodes: [
    { id: 'a', type: 'process/tank', position: { x: 0, y: 0 }, data: { level: 0.5 } },
    { id: 'b', type: 'process/pump', position: { x: 200, y: 0 }, label: 'P-1' },
    { id: 'c', type: 'process/pump', position: { x: 400, y: 0 } },
  ],
  links: [
    {
      id: 'l1',
      from: { node: 'a', port: 'out' },
      to: { node: 'b', port: 'suction' },
      kind: 'process',
    },
    {
      id: 'l2',
      from: { node: 'b', port: 'discharge' },
      to: { node: 'c', port: 'suction' },
      kind: 'process',
    },
  ],
  annotations: [
    { id: 'n1', kind: 'text', text: 'Tank', position: { x: 0, y: -20 }, anchor: { node: 'a' } },
  ],
  meta: { title: 't' },
});

const setup = () => {
  const d = new Diagram();
  d.load(model());
  return d;
};

describe('load / toJSON', () => {
  it('round-trips exactly and copies in both directions', () => {
    const input = model();
    const d = new Diagram();
    d.load(input);
    expect(d.toJSON()).toEqual(input);
    input.nodes[0]!.position.x = 999;
    expect(d.toJSON().nodes[0]!.position.x).toBe(0);
    d.toJSON().nodes[0]!.position.x = 999;
    expect(d.toJSON().nodes[0]!.position.x).toBe(0);
  });

  it('omits optional keys that were absent', () => {
    const d = new Diagram();
    d.load({ version: 1, nodes: [], links: [] });
    expect(d.toJSON()).toEqual({ version: 1, nodes: [], links: [] });
  });

  it.each([
    [{ version: 2, nodes: [], links: [] }, /version/],
    [{ version: 1, nodes: [{ id: 'a' }, { id: 'a' }], links: [] }, /Duplicate node id "a"/],
    [
      { version: 1, nodes: [], links: [{ id: 'l', from: { node: 'x' }, to: { node: 'y' } }] },
      /unknown node "x"/,
    ],
  ])('rejects invalid models', (m, msg) => {
    expect(() => new Diagram().load(m as unknown as DiagramModel)).toThrow(msg);
  });
});

describe('update / undo / redo', () => {
  it('applies a transaction as one undo step and emits one modelChange', () => {
    const d = setup();
    const onChange = vi.fn();
    d.on('modelChange', onChange);
    d.update((tx) => {
      tx.updateNode('a', { position: { x: 10, y: 10 } });
      tx.updateNode('b', { label: 'P-2' });
      tx.addNode({ id: 'd', type: 'process/tank', position: { x: 0, y: 300 } });
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    const { diff, model: snap } = onChange.mock.calls[0]![0];
    expect(diff.changed.nodes).toEqual(['a', 'b']);
    expect(diff.added.nodes).toEqual(['d']);
    expect(snap.nodes).toHaveLength(4);

    d.undo();
    expect(d.toJSON()).toEqual(model());
    expect(d.canRedo()).toBe(true);
    d.redo();
    expect(d.toJSON().nodes[0]!.position).toEqual({ x: 10, y: 10 });
    expect(d.toJSON().nodes[1]!.label).toBe('P-2');
  });

  it('removes keys on undo that the update introduced', () => {
    const d = setup();
    d.update((tx) => tx.updateNode('c', { label: 'new', rotation: 90 }));
    d.undo();
    expect(d.toJSON().nodes[2]).toEqual(model().nodes[2]);
  });

  it('cascades node removal to links and anchored annotations and restores order on undo', () => {
    const d = setup();
    d.update((tx) => tx.removeNode('a'));
    expect(d.toJSON().links.map((l) => l.id)).toEqual(['l2']);
    expect(d.toJSON().annotations).toEqual([]);
    d.undo();
    expect(d.toJSON()).toEqual(model());
  });

  it('rolls back a failing transaction and records nothing', () => {
    const d = setup();
    const onChange = vi.fn();
    d.on('modelChange', onChange);
    expect(() =>
      d.update((tx) => {
        tx.updateNode('a', { label: 'x' });
        tx.addLink({
          id: 'bad',
          from: { node: 'a', port: 'p' },
          to: { node: 'zz', port: 'p' },
          kind: 'signal',
        });
      }),
    ).toThrow(/unknown node "zz"/);
    expect(d.toJSON()).toEqual(model());
    expect(d.canUndo()).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('supports non-undoable updates and clears redo on new undoable work', () => {
    const d = setup();
    d.update((tx) => tx.updateNode('a', { label: 'x' }), { undoable: false });
    expect(d.canUndo()).toBe(false);
    d.update((tx) => tx.updateNode('a', { label: 'y' }));
    d.undo();
    expect(d.canRedo()).toBe(true);
    d.update((tx) => tx.updateNode('a', { label: 'z' }));
    expect(d.canRedo()).toBe(false);
  });

  it('reports nothing for an add+remove within one transaction', () => {
    const d = setup();
    const onChange = vi.fn();
    d.on('modelChange', onChange);
    d.update((tx) => {
      tx.addNode({ id: 'tmp', type: 'process/pump', position: { x: 0, y: 0 } });
      tx.removeNode('tmp');
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('forbids nesting', () => {
    const d = setup();
    expect(() => d.update(() => d.update(() => {}))).toThrow(/nested/);
  });
});

describe('preview', () => {
  it('collapses a gesture into one undo step restoring the original state', () => {
    const d = setup();
    const onChange = vi.fn();
    const onInternal = vi.fn();
    d.on('modelChange', onChange);
    d.internal.on('model', onInternal);
    for (let x = 1; x <= 5; x++) d.preview((tx) => tx.updateNode('a', { position: { x, y: 0 } }));
    expect(onChange).not.toHaveBeenCalled();
    expect(onInternal).toHaveBeenCalledTimes(5);
    expect(() => d.update(() => {})).toThrow(/preview/);
    d.commitPreview();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(d.toJSON().nodes[0]!.position.x).toBe(5);
    d.undo();
    expect(d.toJSON()).toEqual(model());
  });

  it('cancel reverts everything', () => {
    const d = setup();
    d.preview((tx) => tx.updateNode('a', { position: { x: 50, y: 50 } }));
    d.cancelPreview();
    expect(d.toJSON()).toEqual(model());
    expect(d.canUndo()).toBe(false);
    expect(d.isPreviewing()).toBe(false);
  });
});

describe('setNodeData fast path', () => {
  it('merges data and status without undo or modelChange', () => {
    const d = setup();
    const onChange = vi.fn();
    const onData = vi.fn();
    d.on('modelChange', onChange);
    d.internal.on('data', onData);
    d.setNodeData('a', { level: 0.7, temp: 20 }, 'warning');
    expect(d.store.nodes.get('a')).toMatchObject({
      status: 'warning',
      data: { level: 0.7, temp: 20 },
    });
    d.setNodeDataBatch({
      b: { data: { running: true } },
      c: { status: 'alarm' },
      ghost: { status: 'x' },
    });
    expect(onData).toHaveBeenNthCalledWith(2, { ids: ['b', 'c'] });
    expect(onChange).not.toHaveBeenCalled();
    expect(d.canUndo()).toBe(false);
  });

  it('survives undo of an unrelated change to the same node', () => {
    const d = setup();
    d.update((tx) => tx.updateNode('a', { position: { x: 5, y: 5 } }));
    d.setNodeData('a', { level: 0.9 });
    d.undo();
    const a = d.store.nodes.get('a')!;
    expect(a.position).toEqual({ x: 0, y: 0 });
    expect(a.data).toEqual({ level: 0.9 });
  });

  it('replaces the node object so layers can detect changes by reference', () => {
    const d = setup();
    const before = d.store.nodes.get('a');
    d.setNodeData('a', { level: 1 });
    expect(d.store.nodes.get('a')).not.toBe(before);
  });
});

describe('selection', () => {
  it('dedupes, ignores unknown items and only emits on change', () => {
    const d = setup();
    const onSel = vi.fn();
    d.on('selectionChange', onSel);
    d.setSelection([
      { kind: 'node', id: 'a' },
      { kind: 'node', id: 'a' },
      { kind: 'link', id: 'nope' },
      { kind: 'link', id: 'l1' },
    ]);
    expect(d.getSelection()).toEqual([
      { kind: 'node', id: 'a' },
      { kind: 'link', id: 'l1' },
    ]);
    d.setSelection([
      { kind: 'node', id: 'a' },
      { kind: 'link', id: 'l1' },
    ]);
    expect(onSel).toHaveBeenCalledTimes(1);
  });

  it('drops removed items from the selection', () => {
    const d = setup();
    d.setSelection([
      { kind: 'node', id: 'a' },
      { kind: 'link', id: 'l1' },
      { kind: 'node', id: 'c' },
    ]);
    d.update((tx) => tx.removeNode('a'));
    expect(d.getSelection()).toEqual([{ kind: 'node', id: 'c' }]);
  });
});

describe('events / lifecycle', () => {
  it('isolates throwing handlers and supports unsubscribe', async () => {
    const d = setup();
    const errors: unknown[] = [];
    const orig = globalThis.queueMicrotask;
    globalThis.queueMicrotask = (cb) =>
      orig(() => {
        try {
          cb();
        } catch (e) {
          errors.push(e);
        }
      });
    const good = vi.fn();
    d.on('selectionChange', () => {
      throw new Error('boom');
    });
    const off = d.on('selectionChange', good);
    d.setSelection([{ kind: 'node', id: 'a' }]);
    off();
    d.setSelection([]);
    await Promise.resolve();
    globalThis.queueMicrotask = orig;
    expect(good).toHaveBeenCalledTimes(1);
    expect(errors).toHaveLength(2);
  });

  it('throws after destroy', () => {
    const d = setup();
    d.destroy();
    expect(() => d.update(() => {})).toThrow(/destroyed/);
  });

  it('emits mode and theme only on change', () => {
    const d = new Diagram({ mode: 'edit' });
    const onMode = vi.fn();
    d.internal.on('mode', onMode);
    d.setMode('edit');
    d.setMode('view');
    expect(onMode).toHaveBeenCalledExactlyOnceWith({ mode: 'view' });
    expect(d.getTheme()).toBe('auto');
  });
});
