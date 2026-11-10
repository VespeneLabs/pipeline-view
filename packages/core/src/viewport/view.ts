/** DOM skeleton shared by every layer. Built only on mount(), so importing core stays SSR-safe. */
import type { Viewport } from '../diagram/types';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface ViewLayers {
  /** Grid pattern rect, drawn in screen space below everything. */
  grid: SVGGElement;
  /** Dashed leader lines from annotations to their anchor nodes. Below links. */
  leaders: SVGGElement;
  links: SVGGElement;
  nodes: SVGGElement;
  /** SVG text annotations. Above nodes. */
  annotations: SVGGElement;
  /** Editor layer: marquee, handles, guides, connection preview. Diagram coordinates. */
  interaction: SVGGElement;
}

export interface View {
  root: HTMLDivElement;
  svg: SVGSVGElement;
  /** <g> carrying the viewport transform. Every layer except `grid` is inside it. */
  scene: SVGGElement;
  layers: ViewLayers;
  /** HTML overlay with the same transform as `scene`. */
  overlay: HTMLDivElement;
}

export function createView(container: HTMLElement, ariaLabel = 'Process diagram'): View {
  const doc = container.ownerDocument;
  const g = (cls: string) => {
    const el = doc.createElementNS(SVG_NS, 'g');
    el.setAttribute('class', cls);
    return el;
  };
  const root = doc.createElement('div');
  root.className = 'pv-root';
  root.setAttribute('role', 'application');
  root.setAttribute('aria-roledescription', 'diagram');
  root.setAttribute('aria-label', ariaLabel);
  root.tabIndex = 0;
  // Layout essentials live inline so the viewport works without styles.css. Visuals come from styles.css.
  root.style.cssText =
    'position:relative;overflow:hidden;width:100%;height:100%;touch-action:none;user-select:none;outline-offset:-2px';

  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'pv-svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.cssText = 'position:absolute;inset:0;display:block';
  const grid = g('pv-layer-grid');
  const scene = g('pv-scene');
  const layers: ViewLayers = {
    grid,
    leaders: g('pv-layer-leaders'),
    links: g('pv-layer-links'),
    nodes: g('pv-layer-nodes'),
    annotations: g('pv-layer-annotations'),
    interaction: g('pv-layer-interaction'),
  };
  scene.append(layers.leaders, layers.links, layers.nodes, layers.annotations, layers.interaction);
  svg.append(grid, scene);

  const overlay = doc.createElement('div');
  overlay.className = 'pv-overlay';
  // Zero-size box at the diagram origin. Items are absolutely positioned and re-enable pointer events.
  overlay.style.cssText =
    'position:absolute;left:0;top:0;width:0;height:0;transform-origin:0 0;pointer-events:none';

  root.append(svg, overlay);
  container.append(root);
  return { root, svg, scene, layers, overlay };
}

/** Applies the viewport transform to the scene and the overlay. Rounding avoids sub-pixel blur on idle frames. */
export function applyViewportToView(view: View, v: Viewport): void {
  const x = Math.round(v.x * 100) / 100;
  const y = Math.round(v.y * 100) / 100;
  view.scene.setAttribute('transform', `translate(${x},${y}) scale(${v.zoom})`);
  view.overlay.style.transform = `translate(${x}px,${y}px) scale(${v.zoom})`;
  view.root.style.setProperty('--pv-zoom', String(v.zoom));
}
