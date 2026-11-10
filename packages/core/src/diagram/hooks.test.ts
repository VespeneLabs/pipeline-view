import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorCommands } from '../editor/commands';
import type { DiagramModel } from '../model/types';
import type { SymbolDef } from '../symbols/types';
import { Diagram } from './diagram';
import { nodeBounds, portPoint } from './geometry';
import type { DiagramOptions } from './types';

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
    { id: 'a', type: 't/box', position: { x: 0, y: 0 } },
    { id: 'b', type: 't/box', position: { x: 200, y: 0 } },
    { id: 'c', type: 't/box', position: { x: 400, y: 0 } },
  ],
  links: [
    { id: 'ab', from: { node: 'a', port: 'out' }, to: { node: 'b', port: 'in' }, kind: 'process' },
    { id: 'bc', from: { node: 'b', port: 'out' }, to: { node: 'c', port: 'in' }, kind: 'process' },
  ],
});

const setup = (opts: DiagramOptions = {}, m = model()) => {
  const d = new Diagram({ symbols: [box], ...opts });
  d.load(m);
  const cmd = new EditorCommands(d, {
    bounds: (n) => nodeBounds(n, box),
    port: (n, id) => portPoint(n, box, id),
  });
  return { d, cmd };
};
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('onBeforeDelete (FR-43)', () => {
  it('receives the cascaded links and can veto synchronously', () => {
    const onBeforeDelete = vi.fn(() => false);
    const { d } = setup({ onBeforeDelete });
    const onChange = vi.fn();
    d.on('modelChange', onChange);
    d.update((tx) => tx.removeNode('b'));
    expect(onBeforeDelete).toHaveBeenCalledWith({
      nodes: ['b'],
      links: ['ab', 'bc'],
      annotations: [],
    });
    expect(d.toJSON()).toEqual(model());
    expect(onChange).not.toHaveBeenCalled();
    expect(d.canUndo()).toBe(false);
  });

  it('waits for a Promise: applied only when it resolves true', async () => {
    let answer!: (v: boolean) => void;
    const { d } = setup({ onBeforeDelete: () => new Promise((r) => (answer = r)) });
    d.update((tx) => tx.removeLink('ab'));
    expect(d.store.links.has('ab')).toBe(true); // rolled back while the host asks
    answer(true);
    await tick();
    expect(d.store.links.has('ab')).toBe(false);
    expect(d.canUndo()).toBe(true);
    d.undo();
    expect(d.store.links.has('ab')).toBe(true);
  });

  it('a Promise resolving false leaves everything untouched', async () => {
    const { d } = setup({ onBeforeDelete: async () => false });
    d.update((tx) => tx.removeNode('a'));
    await tick();
    expect(d.toJSON()).toEqual(model());
  });

  it('is not asked for changes that remove nothing', () => {
    const onBeforeDelete = vi.fn(() => false);
    const { d } = setup({ onBeforeDelete });
    d.update((tx) => tx.updateNode('a', { label: 'A' }));
    expect(onBeforeDelete).not.toHaveBeenCalled();
    expect(d.store.nodes.get('a')!.label).toBe('A');
  });
});

describe('beforeChange (FR-43)', () => {
  it('vetoes any transaction and receives diff + patch', () => {
    const beforeChange = vi.fn(() => false);
    const { d } = setup({ beforeChange });
    d.update((tx) => tx.updateNode('a', { label: 'A' }));
    expect(d.store.nodes.get('a')!.label).toBeUndefined();
    const [diff, patch] = beforeChange.mock.calls[0]! as unknown as [unknown, unknown];
    expect(diff).toMatchObject({ changed: { nodes: ['a'] } });
    expect(patch).toEqual({ nodes: { changed: [{ id: 'a', label: 'A' }] } });
  });

  it('does not run for host-driven applyDiff / patch', () => {
    const beforeChange = vi.fn(() => false);
    const { d } = setup({ beforeChange });
    d.applyDiff({ nodes: { changed: [{ id: 'a', label: 'A' }] } });
    expect(d.store.nodes.get('a')!.label).toBe('A');
    expect(beforeChange).not.toHaveBeenCalled();
  });

  it('a vetoed gesture (preview) is reverted on commit', () => {
    const { d } = setup({ beforeChange: () => false });
    d.preview((tx) => tx.updateNode('a', { position: { x: 50, y: 50 } }));
    expect(d.store.nodes.get('a')!.position).toEqual({ x: 50, y: 50 });
    d.commitPreview();
    expect(d.store.nodes.get('a')!.position).toEqual({ x: 0, y: 0 });
    expect(d.canUndo()).toBe(false);
  });
});

describe('locking (FR-43)', () => {
  const locked = () => {
    const m = model();
    m.nodes[0]!.locked = true;
    m.links[1]!.locked = true;
    return m;
  };

  it('locked nodes are not moved, transformed or deleted by the editor', () => {
    const { d, cmd } = setup({}, locked());
    cmd.moveBy(['a', 'c'], { x: 10, y: 0 });
    cmd.rotate(['a']);
    cmd.deleteItems([{ kind: 'node', id: 'a' }]);
    expect(d.store.nodes.get('a')).toMatchObject({ position: { x: 0, y: 0 } });
    expect(d.store.nodes.get('a')!.rotation).toBeUndefined();
    expect(d.store.nodes.get('c')!.position).toEqual({ x: 410, y: 0 });
  });

  it('locked links are not deleted or re-routed, nor cascaded away with an unlocked node', () => {
    const { d, cmd } = setup({}, locked());
    cmd.deleteItems([
      { kind: 'link', id: 'bc' },
      { kind: 'node', id: 'c' },
    ]);
    cmd.setLinkPath('bc', [
      { x: 240, y: 10 },
      { x: 300, y: 10 },
      { x: 400, y: 10 },
    ]);
    expect(d.store.links.get('bc')!.routing).toBeUndefined();
    expect(d.store.nodes.has('c')).toBe(true);
  });

  let container: HTMLDivElement | undefined;
  afterEach(() => container?.remove());

  it('sets data-locked on locked nodes and links', () => {
    container = document.createElement('div');
    document.body.append(container);
    const { d } = setup({}, locked());
    d.mount(container);
    d.renderer!.flush();
    expect(container.querySelector('[data-node-id="a"]')!.hasAttribute('data-locked')).toBe(true);
    expect(container.querySelector('[data-node-id="b"]')!.hasAttribute('data-locked')).toBe(false);
    expect(container.querySelector('[data-link-id="bc"]')!.hasAttribute('data-locked')).toBe(true);
    d.update((tx) => tx.updateNode('a', { locked: undefined }));
    d.renderer!.flush();
    expect(container.querySelector('[data-node-id="a"]')!.hasAttribute('data-locked')).toBe(false);
    d.destroy();
  });
});
