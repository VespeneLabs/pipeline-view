import { describe, expect, it } from 'vitest';
import {
  diagramToScreen,
  fitRect,
  lerpViewport,
  screenToDiagram,
  wheelPixels,
  zoomAround,
} from './math';

describe('viewport math', () => {
  const v = { x: 30, y: -10, zoom: 2 };

  it('screen <-> diagram are inverse', () => {
    const p = { x: 123, y: 45 };
    expect(screenToDiagram(v, diagramToScreen(v, p))).toEqual(p);
  });

  it('zoomAround keeps the anchor fixed', () => {
    const anchor = { x: 200, y: 150 };
    const before = screenToDiagram(v, anchor);
    const z = zoomAround(v, 3.5, anchor);
    expect(z.zoom).toBe(3.5);
    const after = screenToDiagram(z, anchor);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('fitRect shows the top-left part when the zoom floor stops the content from fitting', () => {
    // 4000x300 content in 800x600 would need zoom 0.19; with a floor of 0.5 it overflows horizontally.
    const f = fitRect(
      { x: 100, y: 50, width: 4000, height: 300 },
      { width: 800, height: 600 },
      20,
      0.5,
      2,
    );
    expect(f.zoom).toBe(0.5);
    // Left edge at the padding; vertically it still fits, so it stays centered.
    expect(diagramToScreen(f, { x: 100, y: 200 })).toEqual({ x: 20, y: 300 });
  });

  it('fitRect centers and respects padding and zoom limits', () => {
    const f = fitRect(
      { x: 100, y: 100, width: 400, height: 200 },
      { width: 840, height: 640 },
      20,
      0.1,
      8,
    );
    expect(f.zoom).toBe(2); // (840-40)/400
    expect(diagramToScreen(f, { x: 300, y: 200 })).toEqual({ x: 420, y: 320 });
    expect(
      fitRect({ x: 0, y: 0, width: 1, height: 1 }, { width: 800, height: 600 }, 0, 0.1, 4).zoom,
    ).toBe(4);
    expect(
      fitRect({ x: 0, y: 0, width: 0, height: 0 }, { width: 800, height: 600 }, 0, 0.1, 4).zoom,
    ).toBe(4);
  });

  it('lerpViewport hits both ends', () => {
    const b = { x: 0, y: 0, zoom: 0.5 };
    expect(lerpViewport(v, b, 0)).toEqual(v);
    expect(lerpViewport(v, b, 1)).toEqual(b);
  });

  it('normalizes wheel delta modes', () => {
    expect(wheelPixels({ deltaY: 3, deltaMode: 1 })).toBe(48);
    expect(wheelPixels({ deltaY: 10, deltaMode: 0 })).toBe(10);
  });
});
