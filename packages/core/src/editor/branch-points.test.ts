import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Diagram } from '../diagram/diagram';
import type { DiagramOptions } from '../diagram/types';
import type { Point } from '../model/types';
import type { SymbolDef } from '../symbols/types';
import { attachEditor } from './controller';

const box: SymbolDef = {
  type: 'test/box',
  name: 'Box',
  category: 'Test',
  size: { width: 40, height: 40 },
  ports: [
    { id: 'in', position: { x: 0, y: 20 }, direction: 'left' },
    { id: 'out', position: { x: 40, y: 20 }, direction: 'right' },
  ],
  svg: '<rect width="40" height="40"/>',
};

/** a.out (40, 120) feeds b.in (400, 20) and c.in (400, 220). */
let container: HTMLDivElement;
let d: Diagram;
let detach: () => void;

function start(options: DiagramOptions = {}, branch?: Point, locked = false) {
  d = new Diagram({ symbols: [box], mode: 'edit', fitOnLoad: 'never', ...options });
  d.load({
    version: 2,
    nodes: [
      {
        id: 'a',
        type: 'test/box',
        position: { x: 0, y: 100 },
        label: 'A',
        ...(branch ? { branchPoints: { out: branch } } : {}),
        ...(locked ? { locked: true } : {}),
      },
      { id: 'b', type: 'test/box', position: { x: 400, y: 0 } },
      { id: 'c', type: 'test/box', position: { x: 400, y: 200 } },
    ],
    links: [
      {
        id: 'ab',
        from: { node: 'a', port: 'out' },
        to: { node: 'b', port: 'in' },
        kind: 'process',
      },
      {
        id: 'ac',
        from: { node: 'a', port: 'out' },
        to: { node: 'c', port: 'in' },
        kind: 'process',
      },
    ],
  });
  d.mount(container);
  d.renderer!.flush();
  detach = attachEditor(d);
}

const q = (sel: string) => d.view!.root.querySelector<SVGElement>(sel);
const live = () => q('.pv-live')!.textContent;
const branch = () => d.store.nodes.get('a')!.branchPoints;
/** Centre of the (rotated square) handle. */
const centre = (h: Element) => ({
  x: Number(h.getAttribute('x')) + Number(h.getAttribute('width')) / 2,
  y: Number(h.getAttribute('y')) + Number(h.getAttribute('height')) / 2,
});

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
const key = (target: Element, k: string, init: KeyboardEventInit = {}) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...init }));

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(() => {
  detach?.();
  d?.destroy();
  container.remove();
});

describe('branch point handle', () => {
  it('appears where the links of a selected node or link part, and nowhere else', () => {
    start();
    expect(q('.pv-branch-handle')).toBeNull();
    d.setSelection([{ kind: 'node', id: 'a' }]);
    const h = q('.pv-branch-handle')!;
    expect([h.dataset.node, h.dataset.port]).toEqual(['a', 'out']);
    expect(centre(h)).toEqual(d.getBranchPoint('a', 'out')!.point);
    expect(h.classList.contains('pv-fixed')).toBe(false);
    expect(h.getAttribute('tabindex')).toBe('0');
    expect(h.getAttribute('aria-label')).toMatch(
      /^Branch point of port out of A \(Box\), placed by the router\./,
    );
    // b has one link per port: no handle. A link shows the handles of its two ends.
    d.setSelection([{ kind: 'node', id: 'b' }]);
    expect(q('.pv-branch-handle')).toBeNull();
    d.setSelection([{ kind: 'link', id: 'ab' }]);
    expect(d.view!.root.querySelectorAll('.pv-branch-handle')).toHaveLength(1);
  });

  it('is dragged to set the point: one undo step, in modelChange, reported once', () => {
    start();
    const moved = vi.fn();
    const changes = vi.fn();
    d.on('branchPointMove', moved);
    d.on('modelChange', changes);
    d.setSelection([{ kind: 'node', id: 'a' }]);
    const h = q('.pv-branch-handle')!;
    const from = centre(h);
    drag(h, [from.x, from.y], [200, 160]);
    expect(branch()).toEqual({ out: { x: 200, y: 60 } });
    expect(changes).toHaveBeenCalledTimes(1);
    expect(changes.mock.calls[0]![0].patch).toEqual({
      nodes: { changed: [{ id: 'a', branchPoints: { out: { x: 200, y: 60 } } }] },
    });
    expect(moved).toHaveBeenCalledExactlyOnceWith({
      node: 'a',
      port: 'out',
      point: { x: 200, y: 60 },
      at: { x: 200, y: 160 },
    });
    expect(live()).toBe('Branch point at 200, 160.');
    expect(d.getBranchPoint('a', 'out')).toEqual({ point: { x: 200, y: 160 }, fixed: true });
    expect(q('.pv-branch-handle')!.classList.contains('pv-fixed')).toBe(true);
    d.undo();
    expect(branch()).toBeUndefined();
  });

  it('previews while dragging and reverts when the gesture is cancelled', () => {
    start({}, { x: 160, y: 20 });
    d.setSelection([{ kind: 'node', id: 'a' }]);
    drag(q('.pv-branch-handle')!, [160, 120], [220, 150], false);
    expect(branch()).toEqual({ out: { x: 220, y: 50 } });
    d.view!.root.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }));
    expect(branch()).toEqual({ out: { x: 160, y: 20 } });
    expect(d.canUndo()).toBe(false);
  });

  it('snaps a drag to the grid when snapping is on', () => {
    start({ grid: { size: 20, snap: true, visible: false } }, { x: 160, y: 20 });
    d.setSelection([{ kind: 'node', id: 'a' }]);
    drag(q('.pv-branch-handle')!, [160, 120], [227, 151]);
    expect(branch()).toEqual({ out: { x: 220, y: 60 } });
  });

  it('snaps a drag onto the line straight out of the port, in preference to the grid across it', () => {
    // The port is at y = 120; on a 32 grid the nearest lines are 96 and 128.
    start({ grid: { size: 32, snap: true, visible: false } }, { x: 160, y: 60 });
    d.setSelection([{ kind: 'node', id: 'a' }]);
    drag(q('.pv-branch-handle')!, [160, 160], [230, 124]);
    // Within 6 px of the port's line: y is the port's, x still follows the grid.
    expect(branch()).toEqual({ out: { x: 224, y: 20 } });
    expect(d.getLinkPath('ab')!.slice(0, 2)).toEqual([
      { x: 40, y: 120 },
      { x: 224, y: 120 },
    ]);
    // Further away the grid decides again.
    drag(q('.pv-branch-handle')!, [224, 120], [230, 131]);
    expect(branch()).toEqual({ out: { x: 224, y: 28 } });
  });

  it('snaps onto the port line without grid snapping too, and not at all from the keyboard', () => {
    start({}, { x: 160, y: 60 });
    d.setSelection([{ kind: 'node', id: 'a' }]);
    drag(q('.pv-branch-handle')!, [160, 160], [231, 115]);
    expect(branch()).toEqual({ out: { x: 231, y: 20 } });
    q('.pv-branch-handle')!.focus();
    key(document.activeElement!, 'ArrowDown');
    expect(branch()).toEqual({ out: { x: 231, y: 21 } });
  });

  it('moves with the arrow keys while focused, keeps focus, and Delete hands it back to the router', () => {
    start({ grid: { size: 20, snap: true, visible: false } }, { x: 160, y: 20 });
    const moved = vi.fn();
    d.on('branchPointMove', moved);
    d.setSelection([{ kind: 'node', id: 'a' }]);
    q('.pv-branch-handle')!.focus();
    key(document.activeElement!, 'ArrowRight');
    // One unit, exact: keyboard steps are not snapped to the grid.
    expect(branch()).toEqual({ out: { x: 161, y: 20 } });
    expect(live()).toBe('Branch point at 161, 120.');
    // The layer was rebuilt; the new handle has focus.
    expect(document.activeElement).toBe(q('.pv-branch-handle'));
    key(document.activeElement!, 'ArrowDown', { shiftKey: true });
    expect(branch()).toEqual({ out: { x: 161, y: 40 } });
    expect(moved).toHaveBeenCalledTimes(2);
    // The node itself did not move: the arrows went to the handle.
    expect(d.store.nodes.get('a')!.position).toEqual({ x: 0, y: 100 });
    key(document.activeElement!, 'Delete');
    expect(branch()).toBeUndefined();
    expect(d.store.nodes.has('a')).toBe(true);
    expect(moved).toHaveBeenLastCalledWith({ node: 'a', port: 'out', point: null, at: null });
    expect(live()).toBe('Branch point cleared. The router decides.');
    expect(q('.pv-branch-handle')!.classList.contains('pv-fixed')).toBe(false);
    d.undo();
    expect(branch()).toEqual({ out: { x: 161, y: 40 } });
  });

  it("starts from the router's point when the arrow keys are used without an entry", () => {
    start();
    d.setSelection([{ kind: 'node', id: 'a' }]);
    const natural = d.getBranchPoint('a', 'out')!.point;
    q('.pv-branch-handle')!.focus();
    key(document.activeElement!, 'ArrowUp');
    expect(branch()).toEqual({ out: { x: natural.x, y: natural.y - 1 - 100 } });
  });

  it('gives focus back to the canvas on Escape, and leaves undo working from the handle', () => {
    start({}, { x: 160, y: 20 });
    d.setSelection([{ kind: 'node', id: 'a' }]);
    q('.pv-branch-handle')!.focus();
    key(document.activeElement!, 'ArrowRight');
    key(document.activeElement!, 'z', { ctrlKey: true });
    expect(branch()).toEqual({ out: { x: 160, y: 20 } });
    key(document.activeElement!, 'Escape');
    expect(document.activeElement).toBe(d.view!.root);
    expect(d.getSelection()).toEqual([{ kind: 'node', id: 'a' }]);
  });

  it('lets the host phrase the announcements', () => {
    start(
      {
        branchPointMessages: {
          moved: ({ node, port, at }) => `${node.id}.${port} -> ${at.x}/${at.y}`,
          cleared: ({ node, port }) => `${node.id}.${port} auto`,
        },
      },
      { x: 160, y: 20 },
    );
    d.setSelection([{ kind: 'node', id: 'a' }]);
    q('.pv-branch-handle')!.focus();
    key(document.activeElement!, 'ArrowLeft');
    expect(live()).toBe('a.out -> 159/120');
    key(document.activeElement!, 'Backspace');
    expect(live()).toBe('a.out auto');
  });

  it('has no handle on a locked node', () => {
    start({}, { x: 160, y: 20 }, true);
    d.setSelection([{ kind: 'node', id: 'a' }]);
    expect(q('.pv-branch-handle')).toBeNull();
    d.setSelection([{ kind: 'link', id: 'ab' }]);
    expect(q('.pv-branch-handle')).toBeNull();
  });
});
