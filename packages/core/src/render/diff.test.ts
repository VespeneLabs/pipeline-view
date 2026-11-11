import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Diagram } from '../diagram/diagram';
import { equal, getDiff } from '../model/compare';
import type { DiagramModel } from '../model/types';
import type { SymbolDef } from '../symbols/types';
import { orthogonal } from './diff';

const box: SymbolDef = {
  type: 'test/box',
  name: 'Box',
  category: 'Test',
  size: { width: 100, height: 50 },
  ports: [
    { id: 'in', position: { x: 0, y: 25 }, direction: 'left' },
    { id: 'out', position: { x: 100, y: 25 }, direction: 'right' },
  ],
  svg: '<rect class="body" width="100" height="50"/>',
};

const base = (): DiagramModel => ({
  version: 2,
  nodes: [
    { id: 'a', type: 'test/box', position: { x: 0, y: 0 }, label: 'A' },
    { id: 'b', type: 'test/box', position: { x: 300, y: 0 }, label: 'B' },
    { id: 'c', type: 'test/box', position: { x: 0, y: 200 }, label: 'C', data: { size: 2 } },
    { id: 'gone', type: 'test/box', position: { x: 300, y: 200 }, label: 'Gone' },
  ],
  links: [
    { id: 'ab', from: { node: 'a', port: 'out' }, to: { node: 'b', port: 'in' }, kind: 'process' },
    {
      id: 'c-gone',
      from: { node: 'c', port: 'out' },
      to: { node: 'gone', port: 'in' },
      kind: 'process',
    },
  ],
});

/** base → current: b moved, c changed (data), gone removed (with its link), d and b-d added. */
const current = (): DiagramModel => {
  const m = base();
  m.nodes[1] = { ...m.nodes[1]!, position: { x: 320, y: 0 } };
  m.nodes[2] = { ...m.nodes[2]!, data: { size: 3 } };
  m.nodes.splice(3, 1);
  m.nodes.push({ id: 'd', type: 'test/box', position: { x: 600, y: 0 }, label: 'D' });
  m.links.splice(1, 1);
  m.links.push({
    id: 'b-d',
    from: { node: 'b', port: 'out' },
    to: { node: 'd', port: 'in' },
    kind: 'process',
  });
  return m;
};

describe('getDiff', () => {
  it('lists added, removed, moved and changed items in a stable order', () => {
    expect(getDiff(base(), current())).toEqual({
      nodes: [
        { id: 'b', mark: 'moved' },
        { id: 'c', mark: 'changed' },
        { id: 'd', mark: 'added' },
        { id: 'gone', mark: 'removed' },
      ],
      links: [
        { id: 'b-d', mark: 'added' },
        { id: 'c-gone', mark: 'removed' },
      ],
    });
  });

  it('is empty for identical models and treats defaults as absent', () => {
    expect(getDiff(base(), base())).toEqual({ nodes: [], links: [] });
    const same = base();
    same.nodes[0] = { ...same.nodes[0]!, rotation: 0, flipX: false };
    same.links[0] = { ...same.links[0]!, routing: 'auto', waypoints: [] };
    expect(getDiff(base(), same)).toEqual({ nodes: [], links: [] });
  });

  it('counts a move plus another change as changed; waypoints alone as moved', () => {
    const m = base();
    m.nodes[0] = { ...m.nodes[0]!, position: { x: 5, y: 5 }, label: 'A2' };
    m.links[0] = { ...m.links[0]!, routing: 'manual', waypoints: [{ x: 200, y: 100 }] };
    expect(getDiff(base(), m)).toEqual({
      nodes: [{ id: 'a', mark: 'changed' }],
      links: [{ id: 'ab', mark: 'moved' }],
    });
  });

  it('ignores status by default, and other fields on request', () => {
    const m = base();
    m.nodes[0] = { ...m.nodes[0]!, status: 'alarm' };
    m.nodes[2] = { ...m.nodes[2]!, data: { size: 9 } };
    expect(getDiff(base(), m).nodes).toEqual([{ id: 'c', mark: 'changed' }]);
    expect(getDiff(base(), m, { ignore: ['status', 'data'] }).nodes).toEqual([]);
    expect(getDiff(base(), m, { ignore: [] }).nodes.map((n) => n.id)).toEqual(['a', 'c']);
  });

  it('equal compares JSON structurally', () => {
    expect(equal({ a: [1, { b: 2 }], c: undefined }, { a: [1, { b: 2 }] })).toBe(true);
    expect(equal({ a: 1 }, { a: '1' })).toBe(false);
    expect(equal([1, 2], { 0: 1, 1: 2 })).toBe(false);
  });
});

describe('orthogonal', () => {
  it('inserts elbows between points that are not axis-aligned', () => {
    expect(
      orthogonal([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 30 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 30 },
    ]);
  });
});

describe('showDiff', () => {
  let container: HTMLDivElement;
  let d: Diagram;
  const $ = (s: string) => container.querySelector(s);
  const $$ = (s: string) => [...container.querySelectorAll(s)];
  const flush = () => d.diffLayer!.flush();

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    d = new Diagram({ symbols: [box] });
    d.mount(container);
    d.load(current());
    d.showDiff(base());
    flush();
  });

  afterEach(() => {
    d.destroy();
    container.remove();
  });

  it('marks current items with data-diff and outlines marked nodes', () => {
    expect($('[data-node-id="a"]')!.hasAttribute('data-diff')).toBe(false);
    expect($('[data-node-id="b"]')!.getAttribute('data-diff')).toBe('moved');
    expect($('[data-node-id="c"]')!.getAttribute('data-diff')).toBe('changed');
    expect($('[data-node-id="d"]')!.getAttribute('data-diff')).toBe('added');
    expect($('[data-link-id="b-d"]')!.getAttribute('data-diff')).toBe('added');
    expect($('[data-link-id="ab"]')!.hasAttribute('data-diff')).toBe(false);
    const outline = $('.pv-diff-outline[data-diff-node="b"]')!;
    expect(outline.getAttribute('data-diff')).toBe('moved');
    expect([outline.getAttribute('x'), outline.getAttribute('width')]).toEqual(['314', '112']);
  });

  it('draws removed nodes and links as ghosts below the links layer', () => {
    const ghost = $('.pv-diff-ghost[data-diff-node="gone"]')!;
    expect(ghost.getAttribute('data-diff')).toBe('removed');
    expect(ghost.getAttribute('transform')).toBe('translate(300,200)');
    expect(ghost.querySelector('rect.body')).not.toBeNull();
    expect(ghost.querySelector('title')!.textContent).toBe('Removed: Gone');
    // c.out (100,225) → gone.in (300,225), from the base geometry.
    expect($('.pv-diff-ghost-link[data-diff-link="c-gone"]')!.getAttribute('d')).toBe(
      'M100 225L300 225',
    );
    const scene = [...$('.pv-scene')!.children].map((c) => c.getAttribute('class'));
    expect(scene.indexOf('pv-layer-diff')).toBeLessThan(scene.indexOf('pv-layer-links'));
    // Ghosts don't count as items.
    expect(d.hitTest(ghost)).toBeNull();
  });

  it('follows edits and clears with null', () => {
    d.update((tx) => tx.updateNode('a', { label: 'A!' }));
    flush();
    expect($('[data-node-id="a"]')!.getAttribute('data-diff')).toBe('changed');
    d.update((tx) => tx.updateNode('b', { position: { x: 300, y: 0 } }));
    flush();
    expect($('[data-node-id="b"]')!.hasAttribute('data-diff')).toBe(false);
    expect(d.getDiffBase()).not.toBeNull();
    d.showDiff(null);
    flush();
    expect($$('[data-diff]')).toHaveLength(0);
    expect($('.pv-layer-diff')!.childElementCount).toBe(0);
    expect(d.getDiffBase()).toBeNull();
  });

  it('includes ghosts in getBounds while shown, so zoomToFit keeps them in view', () => {
    const bottom = () => d.getBounds().y + d.getBounds().height;
    // Without c, the current nodes all sit at y 0..50 with their labels down to 70; the removed "gone"
    // (y 200..250) is a ghost.
    d.update((tx) => tx.removeNode('c'));
    d.showDiff(null);
    expect(bottom()).toBe(70);
    d.showDiff(base());
    expect(bottom()).toBe(250);
  });

  it('is never saved or exported', () => {
    expect(JSON.stringify(d.toJSON())).not.toContain('diff');
    const svg = d.exportSVG();
    expect(svg).not.toContain('data-diff');
    expect(svg).not.toContain('pv-diff');
  });

  it('can be set before mount', () => {
    const late = new Diagram({ symbols: [box] });
    late.load(current());
    late.showDiff(base());
    const el = document.createElement('div');
    document.body.append(el);
    late.mount(el);
    late.diffLayer!.flush();
    expect(el.querySelector('[data-node-id="d"]')!.getAttribute('data-diff')).toBe('added');
    late.destroy();
    el.remove();
  });
});
