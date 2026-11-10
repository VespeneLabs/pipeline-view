import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiagramModel, ModelPatch } from '../model/types';
import type { SymbolDef } from '../symbols/types';
import { applyPatchTx, diffModels, itemChange } from './changes';
import { Diagram } from './diagram';
import type { HistoryEntry } from './types';

const box: SymbolDef = {
  type: 't/box',
  name: 'Box',
  category: 'T',
  size: { width: 40, height: 20 },
  ports: [
    { id: 'in', position: { x: 0, y: 10 }, direction: 'left' },
    { id: 'out', position: { x: 40, y: 10 }, direction: 'right' },
  ],
  svg: '<rect width="40" height="20"/>',
};

const model = (): DiagramModel => ({
  version: 2,
  nodes: [
    { id: 'a', type: 't/box', position: { x: 0, y: 0 }, label: 'A', data: { setpoint: 5 } },
    { id: 'b', type: 't/box', position: { x: 200, y: 0 } },
    { id: 'c', type: 't/box', position: { x: 200, y: 200 } },
  ],
  links: [
    { id: 'ab', from: { node: 'a', port: 'out' }, to: { node: 'b', port: 'in' }, kind: 'process' },
    { id: 'bc', from: { node: 'b', port: 'out' }, to: { node: 'c', port: 'in' }, kind: 'process' },
  ],
});

describe('patches', () => {
  it('itemChange reports changed keys and removals as null', () => {
    expect(itemChange({ id: 'x', a: 1, b: 2 }, { id: 'x', a: 1, c: 3 } as never)).toEqual({
      id: 'x',
      b: null,
      c: 3,
    });
    expect(itemChange({ id: 'x', a: [1] }, { id: 'x', a: [1] })).toBeNull();
  });

  it('diffModels + applyDiff turn one model into another', () => {
    const target = model();
    target.nodes[0]!.position = { x: 10, y: 0 };
    delete target.nodes[0]!.label;
    target.nodes.push({ id: 'd', type: 't/box', position: { x: 0, y: 300 } });
    target.links = target.links.filter((l) => l.id !== 'bc');
    const d = new Diagram({ symbols: [box] });
    d.load(model());
    d.applyDiff(diffModels(d.toJSON(), target));
    expect(d.toJSON()).toEqual(target);
  });
});

describe('controlled mode (FR-44)', () => {
  let container: HTMLDivElement | undefined;
  afterEach(() => container?.remove());

  it('patch() applies only the difference: selection, live data and viewport survive', () => {
    container = document.createElement('div');
    document.body.append(container);
    const d = new Diagram({ symbols: [box] });
    d.load(model());
    d.mount(container);
    d.renderer!.flush();
    d.setViewport({ x: 33, y: 44, zoom: 1.5 });
    d.setSelection([{ kind: 'node', id: 'c' }]);
    d.setNodeData('a', { pressure: 7 }, 'alarm');
    const untouched = container.querySelector('[data-link-id="bc"] .pv-link-line')!;
    const setD = vi.spyOn(untouched, 'setAttribute');

    // The host's store has no live values and moves node a.
    const next = model();
    next.nodes[0]!.position = { x: 0, y: 40 };
    const applied = d.patch(next);
    d.renderer!.flush();

    expect(applied.nodes?.changed).toEqual([{ id: 'a', position: { x: 0, y: 40 } }]);
    expect(d.store.nodes.get('a')).toMatchObject({
      position: { x: 0, y: 40 },
      status: 'alarm',
      data: { setpoint: 5, pressure: 7 },
    });
    expect(d.getSelection()).toEqual([{ kind: 'node', id: 'c' }]);
    expect(d.getViewport()).toEqual({ x: 33, y: 44, zoom: 1.5 });
    expect(setD).not.toHaveBeenCalled(); // bc isn't attached to a: not re-routed
    expect(d.canUndo()).toBe(false); // patch() is not undoable by default
    d.destroy();
  });

  it('patch() is a no-op when the host passes back the current document', () => {
    const d = new Diagram({ symbols: [box] });
    d.load(model());
    const onChange = vi.fn();
    d.on('modelChange', onChange);
    expect(d.patch(model())).toEqual({});
    expect(onChange).not.toHaveBeenCalled();
  });

  it('modelChange carries a JSON patch that reproduces the change elsewhere', () => {
    const d = new Diagram({ symbols: [box] });
    d.load(model());
    let patch: ModelPatch | undefined;
    d.on('modelChange', (e) => (patch = e.patch));
    d.update((tx) => {
      tx.updateNode('b', { label: 'B' });
      tx.removeNode('c');
    });
    expect(patch).toEqual({
      nodes: { changed: [{ id: 'b', label: 'B' }], removed: ['c'] },
      links: { removed: ['bc'] },
    });
    const mirror = new Diagram({ symbols: [box] });
    mirror.load(model());
    mirror.applyDiff(JSON.parse(JSON.stringify(patch)));
    expect(mirror.toJSON()).toEqual(d.toJSON());
  });

  it('history: false disables undo', () => {
    const d = new Diagram({ symbols: [box], history: false });
    d.load(model());
    d.update((tx) => tx.updateNode('a', { label: 'X' }));
    expect(d.canUndo()).toBe(false);
    d.undo();
    expect(d.store.nodes.get('a')!.label).toBe('X');
  });

  it('a host HistoryAdapter receives entries and drives undo/redo', () => {
    const past: HistoryEntry[] = [];
    const future: HistoryEntry[] = [];
    const d = new Diagram({
      symbols: [box],
      history: {
        push: (e) => {
          past.push(JSON.parse(JSON.stringify(e)));
          future.length = 0;
        },
        undo: () => {
          const e = past.pop();
          if (e) future.push(e);
          return e;
        },
        redo: () => {
          const e = future.pop();
          if (e) past.push(e);
          return e;
        },
        canUndo: () => past.length > 0,
        canRedo: () => future.length > 0,
      },
    });
    d.load(model());
    d.update((tx) => tx.updateNode('a', { position: { x: 50, y: 50 } }));
    d.update((tx) => tx.removeLink('ab'));
    expect(past).toHaveLength(2);
    expect(past[0]).toEqual({
      forward: { nodes: { changed: [{ id: 'a', position: { x: 50, y: 50 } }] } },
      inverse: { nodes: { changed: [{ id: 'a', position: { x: 0, y: 0 } }] } },
    });
    d.undo();
    d.undo();
    // Patch-based history restores content exactly; a re-added item goes to the end of its array.
    const byId = (m: DiagramModel) => ({
      ...m,
      nodes: [...m.nodes].sort((x, y) => x.id.localeCompare(y.id)),
      links: [...m.links].sort((x, y) => x.id.localeCompare(y.id)),
    });
    expect(byId(d.toJSON())).toEqual(byId(model()));
    expect(d.canUndo()).toBe(false);
    d.redo();
    expect(d.store.nodes.get('a')!.position).toEqual({ x: 50, y: 50 });
    expect(past).toHaveLength(1); // applying an entry doesn't push a new one
  });

  it('a committed preview becomes one host history entry with the pre-gesture state', () => {
    const entries: HistoryEntry[] = [];
    const d = new Diagram({
      symbols: [box],
      history: { push: (e) => entries.push(e), undo: () => undefined, redo: () => undefined },
    });
    d.load(model());
    for (let x = 1; x <= 3; x++) d.preview((tx) => tx.updateNode('a', { position: { x, y: 0 } }));
    d.commitPreview();
    expect(entries).toEqual([
      {
        forward: { nodes: { changed: [{ id: 'a', position: { x: 3, y: 0 } }] } },
        inverse: { nodes: { changed: [{ id: 'a', position: { x: 0, y: 0 } }] } },
      },
    ]);
  });

  it('isDirty tracks the document against markSaved, ignoring live data', () => {
    const d = new Diagram({ symbols: [box] });
    d.load(model());
    expect(d.isDirty()).toBe(false);
    d.setNodeData('a', { pressure: 3 }, 'alarm');
    expect(d.isDirty()).toBe(false);
    d.update((tx) => tx.updateNode('b', { label: 'B' }));
    expect(d.isDirty()).toBe(true);
    d.undo();
    expect(d.isDirty()).toBe(false); // back to the saved document
    d.update((tx) => tx.updateNode('b', { label: 'B' }));
    d.markSaved();
    expect(d.isDirty()).toBe(false);
  });

  it('applyPatchTx replays safely (adds that already exist become updates)', () => {
    const d = new Diagram({ symbols: [box] });
    d.load(model());
    const patch: ModelPatch = {
      nodes: { added: [{ id: 'a', type: 't/box', position: { x: 9, y: 9 } }] },
    };
    d.update((tx) => applyPatchTx(tx, d.store, patch));
    expect(d.store.nodes.get('a')!.position).toEqual({ x: 9, y: 9 });
  });
});
