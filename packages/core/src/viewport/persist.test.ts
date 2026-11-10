import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Diagram } from '../diagram/diagram';
import type { DiagramOptions } from '../diagram/types';
import type { DiagramModel } from '../model/types';
import type { SymbolDef } from '../symbols/types';

const box: SymbolDef = {
  type: 't/box',
  name: 'Box',
  category: 'T',
  size: { width: 100, height: 50 },
  ports: [],
};
const model: DiagramModel = {
  version: 2,
  nodes: [
    { id: 'a', type: 't/box', position: { x: 0, y: 0 } },
    { id: 'b', type: 't/box', position: { x: 300, y: 150 } },
  ],
  links: [],
};

let container: HTMLDivElement;
let d: Diagram;
const frames = () => new Promise((r) => setTimeout(r, 60)); // happy-dom rAF ~16 ms

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
});
afterEach(() => {
  d?.destroy();
  container.remove();
  vi.restoreAllMocks();
});
const make = (opts: DiagramOptions = {}) => {
  d = new Diagram({ symbols: [box], ...opts });
  d.mount(container);
  return d;
};

describe('viewportChange.final (FR-47)', () => {
  it('is true for instant programmatic changes, false mid-gesture, true when the gesture ends', () => {
    make();
    const events: boolean[] = [];
    d.on('viewportChange', (e) => events.push(!!e.final));
    d.setViewport({ x: 10 });
    const root = d.view!.root;
    const pe = (type: string, x: number) =>
      root.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          button: 0,
          pointerId: 1,
          isPrimary: true,
          clientX: x,
          clientY: 0,
        }),
      );
    pe('pointerdown', 0);
    pe('pointermove', 20);
    pe('pointermove', 40);
    pe('pointerup', 40);
    expect(events).toEqual([true, false, false, true]);
  });

  it('settles a wheel zoom once the wheel goes quiet', async () => {
    make();
    const finals: boolean[] = [];
    d.on('viewportChange', (e) => finals.push(!!e.final));
    for (let i = 0; i < 3; i++) {
      d.view!.root.dispatchEvent(new WheelEvent('wheel', { deltaY: -50, cancelable: true }));
    }
    expect(finals).toEqual([false, false, false]);
    await new Promise((r) => setTimeout(r, 200));
    expect(finals).toEqual([false, false, false, true]);
  });
});

describe('initialViewport and fitOnLoad (FR-47)', () => {
  it('fits after load, once content has rendered (deferred two frames)', async () => {
    make();
    d.load(model);
    expect(d.getViewport()).toEqual({ x: 0, y: 0, zoom: 1 }); // not yet
    await frames();
    expect(d.getViewport().zoom).not.toBe(1);
  });

  it('keeps initialViewport by default and does not fit', async () => {
    make({ initialViewport: { x: 5, y: 6, zoom: 1.5 } });
    d.load(model);
    await frames();
    expect(d.getViewport()).toEqual({ x: 5, y: 6, zoom: 1.5 });
  });

  it("'always' fits even with an initialViewport; 'never' never fits", async () => {
    make({ initialViewport: { x: 5, y: 6, zoom: 1.5 }, fitOnLoad: 'always' });
    d.load(model);
    await frames();
    expect(d.getViewport()).not.toEqual({ x: 5, y: 6, zoom: 1.5 });
    d.destroy();
    make({ fitOnLoad: 'never' });
    d.load(model);
    await frames();
    expect(d.getViewport()).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('a viewport change before the deferred fit cancels it', async () => {
    make();
    d.load(model);
    d.setViewport({ x: 42, y: 0, zoom: 1 });
    await frames();
    expect(d.getViewport()).toEqual({ x: 42, y: 0, zoom: 1 });
  });
});

describe('lockViewport (FR-47)', () => {
  it('ignores user wheel and drag, keeps programmatic changes', () => {
    make();
    d.lockViewport(true);
    expect(d.view!.root.hasAttribute('data-viewport-locked')).toBe(true);
    const e = new WheelEvent('wheel', { deltaY: -100, cancelable: true });
    d.view!.root.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false); // the page may scroll
    expect(d.getViewport().zoom).toBe(1);
    d.setViewport({ zoom: 2 });
    expect(d.getViewport().zoom).toBe(2);
  });
});
