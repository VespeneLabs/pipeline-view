/**
 * SVG / PNG export (FR-32). The output is standalone: computed styles (CSS variables, theme, currentColor)
 * are inlined as presentation attributes, so the file renders the same anywhere. Editing chrome (ports,
 * hit areas, interaction layer, focus ring) is left out. HTML overlay items are embedded via <foreignObject>.
 */
import type { Rect } from '../model/types';
import type { Diagram } from '../diagram/diagram';
import type { View } from '../viewport/view';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XHTML_NS = 'http://www.w3.org/1999/xhtml';
// Namespace declarations go through setAttributeNS: a plain setAttribute('xmlns') is serialized twice by some DOMs (jsdom).
const XMLNS_NS = 'http://www.w3.org/2000/xmlns/';

const SVG_PROPS = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'letter-spacing',
  'text-transform',
  'paint-order',
] as const;

const HTML_PROPS = [
  'color',
  'background-color',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-radius',
  'padding',
  'margin',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'text-transform',
  'text-align',
  'display',
  'flex-direction',
  'align-items',
  'justify-content',
  'gap',
  'white-space',
  'width',
  'height',
  'box-sizing',
] as const;

/** Elements that are interaction chrome, not drawing. */
const SKIP = '.pv-port, .pv-link-hit, .pv-node-hit, .pv-focus-ring, .pv-selection-box';
const LAYERS = ['leaders', 'links', 'nodes', 'annotations'] as const;

export interface ExportOptions {
  viewportOnly?: boolean;
  padding?: number;
}

export function exportSvgElement(
  diagram: Diagram,
  view: View,
  opts: ExportOptions = {},
): SVGSVGElement {
  diagram.renderer?.flush();
  diagram.overlay?.flush();
  const doc = view.root.ownerDocument;
  const win = doc.defaultView!;
  const pad = opts.padding ?? 16;
  const b = exportBounds(diagram, view, opts.viewportOnly ?? false, pad);

  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttributeNS(XMLNS_NS, 'xmlns', SVG_NS);
  svg.setAttribute('viewBox', `${b.x} ${b.y} ${b.width} ${b.height}`);
  svg.setAttribute('width', String(Math.ceil(b.width)));
  svg.setAttribute('height', String(Math.ceil(b.height)));
  const bg = win.getComputedStyle(view.root).backgroundColor;
  if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
    const rect = doc.createElementNS(SVG_NS, 'rect');
    for (const [k, v] of Object.entries({ x: b.x, y: b.y, width: b.width, height: b.height })) {
      rect.setAttribute(k, String(v));
    }
    rect.setAttribute('fill', bg);
    svg.append(rect);
  }

  for (const name of LAYERS) {
    const live = view.layers[name];
    svg.append(cloneSvg(live, win));
    // Junction dots live right after the links layer.
    if (name === 'links') {
      const j = view.scene.querySelector('.pv-junctions');
      if (j) svg.append(cloneSvg(j as SVGElement, win));
    }
  }

  for (const item of view.overlay.children) {
    const el = item as HTMLElement;
    const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(el.style.transform);
    if (!m) continue;
    const fo = doc.createElementNS(SVG_NS, 'foreignObject');
    fo.setAttribute('x', m[1]!);
    fo.setAttribute('y', m[2]!);
    fo.setAttribute('width', String(el.offsetWidth || parseFloat(el.style.width) || 0));
    fo.setAttribute('height', String(el.offsetHeight || parseFloat(el.style.height) || 0));
    const copy = cloneHtml(el, win);
    copy.setAttributeNS(XMLNS_NS, 'xmlns', XHTML_NS);
    copy.style.transform = '';
    copy.style.position = 'static';
    fo.append(copy);
    svg.append(fo);
  }
  return svg;
}

export function exportSvgString(diagram: Diagram, view: View, opts?: ExportOptions): string {
  const svg = exportSvgElement(diagram, view, opts);
  return new view.root.ownerDocument.defaultView!.XMLSerializer().serializeToString(svg);
}

/** Rasterizes the SVG export. Overlay HTML in foreignObject may be omitted by browsers that taint the canvas. */
export async function exportPng(
  diagram: Diagram,
  view: View,
  opts: ExportOptions & { scale?: number } = {},
): Promise<Blob> {
  const win = view.root.ownerDocument.defaultView!;
  const scale = opts.scale ?? 2;
  const svg = exportSvgElement(diagram, view, opts);
  const w = Number(svg.getAttribute('width'));
  const h = Number(svg.getAttribute('height'));
  const url = win.URL.createObjectURL(
    new win.Blob([new win.XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }),
  );
  try {
    const img = new win.Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const canvas = view.root.ownerDocument.createElement('canvas');
    canvas.width = Math.ceil(w * scale);
    canvas.height = Math.ceil(h * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))),
        'image/png',
      ),
    );
  } finally {
    win.URL.revokeObjectURL(url);
  }
}

function exportBounds(diagram: Diagram, view: View, viewportOnly: boolean, pad: number): Rect {
  if (viewportOnly) {
    const r = view.root;
    const tl = diagram.screenToDiagram({ x: 0, y: 0 });
    const br = diagram.screenToDiagram({ x: r.clientWidth, y: r.clientHeight });
    return { x: tl.x, y: tl.y, width: br.x - tl.x, height: br.y - tl.y };
  }
  const b = diagram.getBounds();
  // Labels hang below nodes and overlays may extend past their anchor, so include rendered extents when available.
  let { x, y, width, height } = b;
  try {
    const bb = (view.scene as SVGGraphicsElement).getBBox();
    if (bb.width > 0) {
      const x2 = Math.max(x + width, bb.x + bb.width);
      const y2 = Math.max(y + height, bb.y + bb.height);
      x = Math.min(x, bb.x);
      y = Math.min(y, bb.y);
      width = x2 - x;
      height = y2 - y;
    }
  } catch {
    /* no layout */
  }
  return { x: x - pad, y: y - pad, width: width + 2 * pad, height: height + 2 * pad };
}

function cloneSvg(live: SVGElement, win: Window): SVGElement {
  const copy = live.cloneNode(false) as SVGElement;
  copy.removeAttribute('tabindex');
  copy.removeAttribute('style');
  const cs = win.getComputedStyle(live);
  if (cs.display === 'none' || cs.visibility === 'hidden') copy.setAttribute('display', 'none');
  if (isShapeOrText(live)) {
    for (const p of SVG_PROPS) {
      const v = cs.getPropertyValue(p);
      if (v) copy.setAttribute(p, v);
    }
  }
  for (const child of live.childNodes) {
    if (child.nodeType === 1) {
      const el = child as SVGElement;
      if (el.matches(SKIP)) continue;
      copy.append(cloneSvg(el, win));
    } else if (child.nodeType === 3) {
      copy.append(child.cloneNode());
    }
  }
  return copy;
}

const isShapeOrText = (el: Element) =>
  /^(path|circle|ellipse|rect|line|polyline|polygon|text|tspan)$/.test(el.localName);

function cloneHtml(live: HTMLElement, win: Window): HTMLElement {
  const copy = live.cloneNode(false) as HTMLElement;
  const cs = win.getComputedStyle(live);
  for (const p of HTML_PROPS) {
    const v = cs.getPropertyValue(p);
    if (v) copy.style.setProperty(p, v);
  }
  for (const child of live.childNodes) {
    if (child.nodeType === 1) copy.append(cloneHtml(child as HTMLElement, win));
    else if (child.nodeType === 3) copy.append(child.cloneNode());
  }
  return copy;
}
