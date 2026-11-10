import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Diagram } from '../diagram/diagram';
import type { HtmlRenderer } from '../diagram/types';
import type { SymbolDef } from '../symbols/types';
import { leaderPoints } from './paths';

const box: SymbolDef = {
  type: 'test/box',
  name: 'Box',
  category: 'Test',
  size: { width: 100, height: 50 },
  ports: [{ id: 'in', position: { x: 0, y: 25 }, direction: 'left' }],
  svg: '<rect width="100" height="50"/>',
};

let container: HTMLDivElement;
let d: Diagram;
let card: ReturnType<typeof vi.fn<HtmlRenderer>>;
let cleanup: ReturnType<typeof vi.fn>;
const $ = (s: string) => container.querySelector(s);

const flush = () => {
  d.renderer!.flush();
  d.overlay!.flush();
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  cleanup = vi.fn();
  card = vi.fn<HtmlRenderer>((el, item) => {
    el.textContent = `${item.id}: ${String(item.data?.value)}`;
    return cleanup as () => void;
  });
  d = new Diagram({ symbols: [box], htmlRenderers: { card } });
  d.load({
    version: 1,
    nodes: [
      { id: 'tank', type: 'test/box', position: { x: 100, y: 100 }, data: { value: 1 } },
      {
        id: 'pump',
        type: 'test/box',
        position: { x: 400, y: 100 },
        data: { overlay: 'card', value: 7 },
      },
    ],
    links: [],
    annotations: [
      { id: 'title', kind: 'text', text: 'Area 1', variant: 'area', position: { x: 0, y: 0 } },
      {
        id: 'reading',
        kind: 'html',
        renderer: 'card',
        position: { x: 0, y: -80 },
        size: { width: 100, height: 40 },
        anchor: { node: 'tank' },
        leader: true,
        data: { unit: 'bar' },
      },
    ],
  });
  d.mount(container);
  flush();
});

afterEach(() => {
  d.destroy();
  container.remove();
});

describe('OverlayRenderer', () => {
  it('renders text annotations as SVG text', () => {
    const t = $('[data-annotation-id="title"]')!;
    expect(t.tagName.toLowerCase()).toBe('text');
    expect(t.textContent).toBe('Area 1');
    expect(t.getAttribute('data-variant')).toBe('area');
  });

  it('mounts HTML annotations relative to their anchor with merged live data', () => {
    const el = $('.pv-overlay [data-annotation-id="reading"]') as HTMLElement;
    expect(el.style.transform).toBe('translate(100px,20px)');
    expect(el.style.width).toBe('100px');
    expect(card).toHaveBeenCalledWith(el, {
      kind: 'annotation',
      id: 'reading',
      data: { value: 1, unit: 'bar' },
      status: undefined,
    });
  });

  it('mounts node overlays named by data.overlay over the node bounds', () => {
    const el = $('.pv-overlay [data-node-id="pump"]') as HTMLElement;
    expect(el.style.transform).toBe('translate(400px,100px)');
    expect(el.textContent).toBe('pump: 7');
  });

  it('re-calls the renderer on live data without remounting, and keeps the first cleanup', () => {
    const el = $('.pv-overlay [data-annotation-id="reading"]');
    card.mockClear();
    d.setNodeData('tank', { value: 2 }, 'alarm');
    flush();
    expect(card).toHaveBeenCalledTimes(1);
    expect($('.pv-overlay [data-annotation-id="reading"]')).toBe(el);
    expect(el!.textContent).toBe('reading: 2');
    expect(el!.getAttribute('data-status')).toBe('alarm');
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('skips placement and leader work on data-only ticks of the anchor', () => {
    const leader = $('.pv-leader')!;
    const setD = vi.spyOn(leader, 'setAttribute');
    d.setNodeData('tank', { value: 3 });
    flush();
    expect(setD).not.toHaveBeenCalled();
    expect($('.pv-overlay [data-annotation-id="reading"]')!.textContent).toBe('reading: 3');
  });

  it('re-aims the leader when the anchor rotates (same position object)', () => {
    d.update((tx) => tx.updateNode('tank', { position: { x: 100, y: 200 } }));
    flush();
    const before = $('.pv-leader')!.getAttribute('d');
    d.update((tx) => tx.updateNode('tank', { rotation: 90 }));
    flush();
    expect($('.pv-leader')!.getAttribute('d')).not.toBe(before);
  });

  it('tracks re-anchoring so data ticks reach the new anchor only', () => {
    d.update((tx) => tx.updateAnnotation('reading', { anchor: { node: 'pump' } }));
    flush();
    card.mockClear();
    d.setNodeData('tank', { value: 9 });
    flush();
    expect(card).not.toHaveBeenCalled();
    d.setNodeData('pump', { value: 10 });
    flush();
    expect(card.mock.calls.map((c) => c[1].id).sort()).toEqual(['pump', 'reading']);
  });

  it('does not re-call renderers for unrelated data ticks', () => {
    card.mockClear();
    d.setNodeData('pump', { value: 8 });
    flush();
    expect(card).toHaveBeenCalledTimes(1);
    expect(card.mock.calls[0]![1].id).toBe('pump');
  });

  it('follows the anchor when it moves and draws a leader to it', () => {
    expect($('.pv-leader')!.getAttribute('d')).toBe('M150 60L150 100');
    d.update((tx) => tx.updateNode('tank', { position: { x: 200, y: 100 } }));
    flush();
    expect(($('.pv-overlay [data-annotation-id="reading"]') as HTMLElement).style.transform).toBe(
      'translate(200px,20px)',
    );
    expect($('.pv-leader')!.getAttribute('d')).toBe('M250 60L250 100');
  });

  it('runs cleanup and removes elements when items go away', () => {
    d.update((tx) => tx.removeNode('tank'));
    flush();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect($('[data-annotation-id="reading"]')).toBeNull();
    expect($('.pv-leader')).toBeNull();
    d.update((tx) => tx.updateNode('pump', { data: {} }));
    flush();
    expect($('.pv-overlay [data-node-id="pump"]')).toBeNull();
  });

  it('warns once for an unknown renderer instead of throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    d.update((tx) => {
      tx.addAnnotation({ id: 'x1', kind: 'html', renderer: 'nope', position: { x: 0, y: 0 } });
      tx.addAnnotation({ id: 'x2', kind: 'html', renderer: 'nope', position: { x: 0, y: 0 } });
    });
    flush();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('leader routing', () => {
  it('routes around a node that sits between the card and its anchor', () => {
    d.update((tx) => {
      // A blocker right between the card (above tank) and the tank.
      tx.addNode({ id: 'blocker', type: 'test/box', position: { x: 100, y: 0 } });
      tx.updateAnnotation('reading', { position: { x: 0, y: -160 } });
    });
    flush();
    const dPath = $('.pv-leader')!.getAttribute('d')!;
    const pts = [...dPath.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => ({
      x: +m[1]!,
      y: +m[2]!,
    }));
    expect(pts.length).toBeGreaterThan(2);
    // No vertex lies strictly inside the blocker (100..200 x 0..50).
    for (const p of pts) expect(p.x > 100 && p.x < 200 && p.y > 0 && p.y < 50).toBe(false);
  });

  it('follows leaderWaypoints (relative to the anchor) from card edge to node edge', () => {
    d.update((tx) =>
      tx.updateAnnotation('reading', {
        position: { x: 200, y: -80 },
        leaderWaypoints: [
          { x: 160, y: -60 },
          { x: 160, y: 25 },
        ],
      }),
    );
    flush();
    // Card at (300,20) 100x40; waypoints at (260,40) and (260,125); node 100..200 x 100..150.
    expect($('.pv-leader')!.getAttribute('d')).toBe('M300 40L260 40L260 125L200 125');
  });
});

describe('leader waypoints ending on the node', () => {
  it('ends at a final waypoint that lies on or inside the node bounds', () => {
    d.update((tx) =>
      tx.updateAnnotation('reading', {
        position: { x: 200, y: -80 },
        // Last waypoint (78,14) relative to the tank = (178,114): inside 100..200 x 100..150.
        leaderWaypoints: [
          { x: 78, y: -60 },
          { x: 78, y: 14 },
        ],
      }),
    );
    flush();
    expect($('.pv-leader')!.getAttribute('d')).toBe('M300 40L178 40L178 114');
  });
});

describe('leaderPoints', () => {
  const node = { x: 100, y: 100, width: 100, height: 50 };
  it('is straight when the boxes overlap on one axis', () => {
    expect(leaderPoints({ x: 120, y: 0, width: 40, height: 20 }, node)).toEqual([
      { x: 140, y: 20 },
      { x: 140, y: 100 },
    ]);
    expect(leaderPoints({ x: 300, y: 110, width: 40, height: 20 }, node)).toEqual([
      { x: 300, y: 120 },
      { x: 200, y: 120 },
    ]);
  });
  it('uses one elbow otherwise, and nothing when the boxes intersect', () => {
    expect(leaderPoints({ x: 300, y: 0, width: 40, height: 20 }, node)).toEqual([
      { x: 300, y: 10 },
      { x: 150, y: 10 },
      { x: 150, y: 100 },
    ]);
    expect(leaderPoints({ x: 110, y: 110, width: 10, height: 10 }, node)).toEqual([]);
  });
});

describe('pointer events', () => {
  const click = (target: Element, type = 'click') =>
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: 10, clientY: 10 }));

  it('emits nodeClick for symbols and ports, and selects in view mode', () => {
    const onClick = vi.fn();
    d.on('nodeClick', onClick);
    click($('[data-node-id="tank"] .pv-symbol rect')!);
    expect(onClick.mock.calls[0]![0].item).toEqual({ kind: 'node', id: 'tank' });
    expect(d.getSelection()).toEqual([{ kind: 'node', id: 'tank' }]);
    click($('[data-node-id="tank"] .pv-port')!);
    expect(onClick).toHaveBeenCalledTimes(2);
    click(d.view!.svg);
    expect(d.getSelection()).toEqual([]);
  });

  it('does not change the selection in edit mode', () => {
    d.setMode('edit');
    click($('[data-node-id="tank"] .pv-symbol rect')!);
    expect(d.getSelection()).toEqual([]);
  });

  it('emits contextMenu with or without an item, and hover only on change', () => {
    const onMenu = vi.fn();
    const onHover = vi.fn();
    d.on('contextMenu', onMenu);
    d.on('hover', onHover);
    click(d.view!.svg, 'contextmenu');
    expect(onMenu.mock.calls[0]![0].item).toBeNull();
    const target = $('[data-node-id="tank"] .pv-symbol rect')!;
    for (let i = 0; i < 3; i++) {
      target.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' }),
      );
    }
    expect(onHover).toHaveBeenCalledTimes(1);
    expect(onHover.mock.calls[0]![0].item).toEqual({ kind: 'node', id: 'tank' });
  });
});
