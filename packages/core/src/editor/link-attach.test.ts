import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Diagram } from '../diagram/diagram';
import type { DiagramOptions } from '../diagram/types';
import type { LinkModel, Point } from '../model/types';
import type { SymbolDef } from '../symbols/types';
import { attachEditor } from './controller';

const box: SymbolDef = {
  type: 'test/box',
  name: 'Box',
  category: 'Test',
  size: { width: 40, height: 40 },
  ports: [
    { id: 'in', position: { x: 0, y: 20 }, direction: 'left', role: 'in', maxLinks: 1 },
    { id: 'out', position: { x: 40, y: 20 }, direction: 'right', role: 'out' },
    { id: 'top', position: { x: 20, y: 0 }, direction: 'top' },
    { id: 'side', position: { x: 20, y: 40 }, direction: 'bottom' },
  ],
  svg: '<rect width="40" height="40"/>',
};

/**
 *   a ────────────── b     main: a.out -> b.in, straight at y = 20 from x = 40 to x = 400
 *
 *           c              c's top port is at (220, 200)
 */
let container: HTMLDivElement;
let d: Diagram;
let detach: () => void;

function start(options: DiagramOptions = {}, extra: LinkModel[] = []) {
  d = new Diagram({
    symbols: [box],
    mode: 'edit',
    fitOnLoad: 'never',
    linkAttach: true,
    ...options,
  });
  d.load({
    version: 2,
    nodes: [
      { id: 'a', type: 'test/box', position: { x: 0, y: 0 }, label: 'A' },
      { id: 'b', type: 'test/box', position: { x: 400, y: 0 }, label: 'B' },
      { id: 'c', type: 'test/box', position: { x: 200, y: 200 }, label: 'C' },
    ],
    links: [
      {
        id: 'main',
        from: { node: 'a', port: 'out' },
        to: { node: 'b', port: 'in' },
        kind: 'process',
      },
      ...extra,
    ],
  });
  d.mount(container);
  d.renderer!.flush();
  detach = attachEditor(d);
}

const side = (at = 0.5): LinkModel => ({
  id: 'side',
  from: { node: 'c', port: 'top' },
  to: { node: 'b', port: 'in' },
  kind: 'process',
  toAttach: { link: 'main', at },
});

const q = (sel: string) => d.view!.root.querySelector(sel);
const port = (node: string, id: string) => q(`[data-node-id="${node}"] [data-port-id="${id}"]`)!;
const live = () => q('.pv-live')!.textContent;
const link = (id: string) => d.store.links.get(id);
const end = (id: string): Point => d.getLinkPath(id)!.at(-1)!;

function pointer(type: string, target: Element, x: number, y: number) {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      clientX: x,
      clientY: y,
    }),
  );
}
function drag(target: Element, from: [number, number], to: [number, number], release = true) {
  pointer('pointerdown', target, ...from);
  pointer('pointermove', d.view!.root, (from[0] + to[0]) / 2, (from[1] + to[1]) / 2);
  pointer('pointermove', d.view!.root, ...to);
  if (release) pointer('pointerup', d.view!.root, ...to);
}
const key = (k: string, shiftKey = false) =>
  d.view!.root.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true }));

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(() => {
  detach?.();
  d?.destroy();
  container.remove();
});

describe('dropping a connection on a link', () => {
  it('creates a link whose end is attached where it was dropped, and selects it', () => {
    start();
    drag(port('c', 'top'), [220, 200], [130, 24]);
    expect(link('process_1')).toEqual({
      id: 'process_1',
      from: { node: 'c', port: 'top' },
      to: { node: 'b', port: 'in' },
      kind: 'process',
      toAttach: { link: 'main', at: 0.25 },
    });
    expect(d.getSelection()).toEqual([{ kind: 'link', id: 'process_1' }]);
    d.renderer!.flush();
    expect(end('process_1')).toEqual({ x: 130, y: 20 });
    d.undo();
    expect(link('process_1')).toBeUndefined();
  });

  it('marks the landing point while the pointer is over a link', () => {
    start();
    drag(port('c', 'top'), [220, 200], [130, 24], false);
    const mark = q('.pv-attach-target')!;
    expect(mark.getAttribute('data-target-link')).toBe('main');
    expect([mark.getAttribute('cx'), mark.getAttribute('cy')]).toEqual(['130', '20']);
    pointer('pointermove', d.view!.root, 130, 120);
    expect(q('.pv-attach-target')).toBeNull();
    pointer('pointerup', d.view!.root, 130, 120);
    expect(d.store.links.size).toBe(1);
  });

  it('is off unless linkAttach is set', () => {
    start({ linkAttach: false });
    drag(port('c', 'top'), [220, 200], [130, 24]);
    expect(d.store.links.size).toBe(1);
  });

  it('starts from an inlet as a link that flows out of the host link', () => {
    start();
    drag(port('c', 'in'), [200, 220], [310, 16]);
    expect(link('process_1')).toMatchObject({
      from: { node: 'a', port: 'out' },
      to: { node: 'c', port: 'in' },
      fromAttach: { link: 'main', at: 0.75 },
    });
    expect(link('process_1')!.toAttach).toBeUndefined();
  });

  it('does not count the attached end against the port limit, but still asks canConnect', () => {
    const canConnect = vi.fn(() => true as const);
    start({ canConnect });
    // b.in takes one link and main already uses it.
    drag(port('c', 'top'), [220, 200], [130, 24]);
    expect(link('process_1')).toBeDefined();
    const [from, to, kind, ctx] = canConnect.mock.calls.at(-1)! as unknown as [
      { node: { id: string }; port: string },
      { node: { id: string }; port: string },
      string,
      { attach?: { end: string; link: LinkModel; at: number } },
    ];
    expect([from.node.id, from.port, to.node.id, to.port, kind]).toEqual([
      'c',
      'top',
      'b',
      'in',
      'process',
    ]);
    expect(ctx.attach).toMatchObject({ end: 'to', at: 0.25 });
    expect(ctx.attach!.link.id).toBe('main');
    // A second attached end on the same port is fine too; a plain link to the full port is not.
    expect(d.connect({ node: 'c', port: 'side' }, { node: 'b', port: 'in' }).ok).toBe(false);
  });

  it('lets canConnect refuse, with the reason shown and reported', () => {
    const rejected = vi.fn();
    start({
      canConnect: (_f, _t, _k, ctx) =>
        ctx.attach ? { ok: false, reason: 'No taps on this line.', code: 'no-taps' } : true,
    });
    d.on('connectRejected', rejected);
    drag(port('c', 'top'), [220, 200], [130, 24], false);
    expect(q('.pv-refusal-tip')!.textContent).toBe('No taps on this line.');
    pointer('pointerup', d.view!.root, 130, 24);
    expect(d.store.links.size).toBe(1);
    expect(rejected).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'no-taps',
        reason: 'No taps on this line.',
        from: { node: 'c', port: 'top' },
        to: { node: 'b', port: 'in' },
      }),
    );
  });

  it('lets resolveAttach change the ends and the place, and validates the result', () => {
    const resolveAttach = vi.fn((p) => ({
      ...p,
      to: { node: p.to.node, port: 'side' },
      toAttach: { ...p.toAttach!, at: 0.5 },
    }));
    start({ resolveAttach });
    drag(port('c', 'top'), [220, 200], [130, 24]);
    expect(resolveAttach).toHaveBeenCalledWith({
      from: { node: 'c', port: 'top' },
      to: { node: 'b', port: 'in' },
      kind: 'process',
      toAttach: { link: 'main', at: 0.25 },
    });
    expect(link('process_1')).toMatchObject({
      to: { node: 'b', port: 'side' },
      toAttach: { link: 'main', at: 0.5 },
    });
  });

  it('does not offer a link that resolveAttach declines, or a locked one', () => {
    start({ resolveAttach: () => null });
    drag(port('c', 'top'), [220, 200], [130, 24]);
    expect(d.store.links.size).toBe(1);
    detach();
    d.destroy();

    const rejected = vi.fn();
    start();
    d.update((tx) => tx.updateLink('main', { locked: true }));
    d.on('connectRejected', rejected);
    drag(port('c', 'top'), [220, 200], [130, 24]);
    expect(d.store.links.size).toBe(1);
    expect(rejected).toHaveBeenCalledWith(expect.objectContaining({ code: 'attach-locked' }));
  });

  it('prefers a port or a node body under the pointer over a link', () => {
    start();
    // b's inlet is at (400, 20), the end of main: the port wins and refuses (it is full).
    const rejected = vi.fn();
    d.on('connectRejected', rejected);
    drag(port('c', 'top'), [220, 200], [398, 20]);
    expect(d.store.links.size).toBe(1);
    expect(rejected).toHaveBeenCalledWith(expect.objectContaining({ code: 'port-full' }));
  });
});

describe('connect() with an attached end', () => {
  it('creates the link, and refuses a missing host link', () => {
    start({ linkAttach: false });
    const r = d.connect({ node: 'c', port: 'top' }, { node: 'b', port: 'in' }, 'signal', {
      toAttach: { link: 'main', at: 0.1 },
    });
    expect(r).toEqual({ ok: true, id: 'signal_1' });
    expect(link('signal_1')!.toAttach).toEqual({ link: 'main', at: 0.1 });
    expect(
      d.connect({ node: 'c', port: 'side' }, { node: 'b', port: 'in' }, 'signal', {
        toAttach: { link: 'nope', at: 0.1 },
      }),
    ).toMatchObject({ ok: false, code: 'attach-missing-link' });
  });

  it('moves the attachment with its end when the ends are swapped into flow order', () => {
    start();
    // Passed against the flow: c.in is an inlet, so the link is stored as a.out -> c.in.
    const r = d.connect({ node: 'c', port: 'in' }, { node: 'a', port: 'out' }, 'process', {
      toAttach: { link: 'main', at: 0.5 },
    });
    expect(r.ok).toBe(true);
    expect(link('process_1')).toMatchObject({
      from: { node: 'a', port: 'out' },
      to: { node: 'c', port: 'in' },
      fromAttach: { link: 'main', at: 0.5 },
    });
  });
});

describe('moving an attach point', () => {
  it('drags the handle of a selected link along the host link, as one undo step', () => {
    start({}, [side()]);
    const changes = vi.fn();
    d.on('modelChange', changes);
    d.setSelection([{ kind: 'link', id: 'side' }]);
    const handle = q('.pv-attach-handle')!;
    expect([handle.getAttribute('cx'), handle.getAttribute('cy')]).toEqual(['220', '20']);
    drag(handle, [220, 20], [310, 60]);
    expect(link('side')!.toAttach).toEqual({ link: 'main', at: 0.75 });
    expect(changes).toHaveBeenCalledTimes(1);
    expect(changes.mock.calls[0]![0].patch).toEqual({
      links: { changed: [{ id: 'side', toAttach: { link: 'main', at: 0.75 } }] },
    });
    expect(live()).toBe('Connection point at 75% along link A to B.');
    d.renderer!.flush();
    expect(end('side')).toEqual({ x: 310, y: 20 });
    d.undo();
    expect(link('side')!.toAttach).toEqual({ link: 'main', at: 0.5 });
  });

  it('previews while dragging and reverts on Escape', () => {
    start({}, [side()]);
    d.setSelection([{ kind: 'link', id: 'side' }]);
    drag(q('.pv-attach-handle')!, [220, 20], [310, 60], false);
    expect(link('side')!.toAttach!.at).toBe(0.75);
    d.view!.root.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }));
    expect(link('side')!.toAttach!.at).toBe(0.5);
    expect(d.canUndo()).toBe(false);
  });

  it('shows no handle for a locked link or a missing host', () => {
    start({}, [{ ...side(), locked: true }]);
    d.setSelection([{ kind: 'link', id: 'side' }]);
    expect(q('.pv-attach-handle')).toBeNull();
    detach();
    d.destroy();
    start({}, [{ ...side(), toAttach: { link: 'nope', at: 0.5 } }]);
    d.setSelection([{ kind: 'link', id: 'side' }]);
    expect(q('.pv-attach-handle')).toBeNull();
  });

  it('moves with the arrow keys along the host link, and says where it is', () => {
    start({}, [side()]);
    d.setSelection([{ kind: 'link', id: 'side' }]);
    key('ArrowRight');
    d.renderer!.flush();
    expect(end('side')).toEqual({ x: 221, y: 20 });
    key('ArrowRight', true); // Shift: one grid step (10)
    d.renderer!.flush();
    expect(end('side')).toEqual({ x: 231, y: 20 });
    expect(live()).toBe('Connection point at 53% along link A to B.');
    // The host link runs left to right here: up and down have nowhere to go.
    const before = link('side')!.toAttach;
    key('ArrowUp');
    key('ArrowDown');
    expect(link('side')!.toAttach).toEqual(before);
    key('ArrowLeft', true);
    key('ArrowLeft');
    d.renderer!.flush();
    expect(end('side')).toEqual({ x: 220, y: 20 });
    d.undo();
    d.renderer!.flush();
    expect(end('side')).toEqual({ x: 221, y: 20 });
  });

  it('stops at the ends of the host link', () => {
    start({}, [side(1)]);
    d.setSelection([{ kind: 'link', id: 'side' }]);
    key('ArrowRight', true);
    expect(link('side')!.toAttach!.at).toBe(1);
    expect(d.canUndo()).toBe(false);
  });

  it('lets the host phrase the announcement', () => {
    start(
      {
        attachMessages: {
          moved: ({ link, host, end, at }) => `${link.id} ${end} ${host.id} ${at.toFixed(2)}`,
        },
      },
      [side()],
    );
    d.setSelection([{ kind: 'link', id: 'side' }]);
    key('ArrowLeft', true);
    expect(live()).toBe('side to main 0.47');
  });

  it('still nudges nodes when the selection is not an attached link', () => {
    start({}, [side()]);
    d.setSelection([{ kind: 'node', id: 'c' }]);
    key('ArrowRight');
    expect(d.store.nodes.get('c')!.position).toEqual({ x: 201, y: 200 });
  });
});

describe('keyboard connect onto a link', () => {
  it('offers links after ports, attaches at the middle and hands over to the arrow keys', () => {
    start();
    d.setSelection([{ kind: 'node', id: 'c' }]);
    key('c');
    key('Tab'); // in -> out
    key('Tab'); // out -> top
    expect(live()).toBe('port top of C (Box), 3 of 4.');
    key('Enter');
    // Ports first (a's and b's free ones), then the one link.
    expect(live()).toMatch(/compatible ports and links\./);
    key('ArrowUp'); // wraps to the last target: the link
    expect(live()).toMatch(/^link A to B, \d+ of \d+\.$/);
    const mark = q('.pv-kb-port')!;
    expect([mark.getAttribute('cx'), mark.getAttribute('cy')]).toEqual(['220', '20']);
    key('Enter');
    expect(link('process_1')).toMatchObject({
      from: { node: 'c', port: 'top' },
      to: { node: 'b', port: 'in' },
      toAttach: { link: 'main', at: 0.5 },
    });
    expect(live()).toBe(
      'Connected port top of C (Box) to link A to B. Use the arrow keys to move the connection point.',
    );
    key('ArrowLeft', true);
    d.renderer!.flush();
    expect(end('process_1')).toEqual({ x: 210, y: 20 });
  });

  it('offers no links without linkAttach', () => {
    start({ linkAttach: false });
    d.setSelection([{ kind: 'node', id: 'c' }]);
    key('c');
    key('Tab');
    key('Tab');
    key('Enter');
    expect(live()).toMatch(/compatible ports\./);
  });
});
