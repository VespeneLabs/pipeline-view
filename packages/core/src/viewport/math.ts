/** Pure viewport math. A viewport maps diagram -> screen as `screen = diagram * zoom + (x, y)`. */
import type { Point, Rect, Size } from '../model/types';
import type { Viewport } from '../diagram/types';

export const DEFAULT_MIN_ZOOM = 0.1;
export const DEFAULT_MAX_ZOOM = 8;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function screenToDiagram(v: Viewport, p: Point): Point {
  return { x: (p.x - v.x) / v.zoom, y: (p.y - v.y) / v.zoom };
}

export function diagramToScreen(v: Viewport, p: Point): Point {
  return { x: p.x * v.zoom + v.x, y: p.y * v.zoom + v.y };
}

/** Zooms to `zoom` while keeping the diagram point under `screenPoint` fixed. */
export function zoomAround(v: Viewport, zoom: number, screenPoint: Point): Viewport {
  const d = screenToDiagram(v, screenPoint);
  return { zoom, x: screenPoint.x - d.x * zoom, y: screenPoint.y - d.y * zoom };
}

/** Viewport that centers `bounds` in a container of `size`, with `padding` screen pixels on every side. */
export function fitRect(
  bounds: Rect,
  size: Size,
  padding: number,
  minZoom: number,
  maxZoom: number,
): Viewport {
  const aw = Math.max(1, size.width - 2 * padding);
  const ah = Math.max(1, size.height - 2 * padding);
  const zx = bounds.width > 0 ? aw / bounds.width : maxZoom;
  const zy = bounds.height > 0 ? ah / bounds.height : maxZoom;
  const zoom = clamp(Math.min(zx, zy), minZoom, maxZoom);
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  return { zoom, x: size.width / 2 - cx * zoom, y: size.height / 2 - cy * zoom };
}

/** Ease-out cubic interpolation between viewports, zooming geometrically so it feels uniform. */
export function lerpViewport(a: Viewport, b: Viewport, t: number): Viewport {
  const e = 1 - Math.pow(1 - t, 3);
  return {
    x: a.x + (b.x - a.x) * e,
    y: a.y + (b.y - a.y) * e,
    zoom: a.zoom * Math.pow(b.zoom / a.zoom, e),
  };
}

/** Wheel delta in pixels, normalized across deltaMode. */
export function wheelPixels(e: Pick<WheelEvent, 'deltaY' | 'deltaMode'>): number {
  return e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
}
