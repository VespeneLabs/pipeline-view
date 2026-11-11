import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Diagram } from '../diagram/diagram';
import type { DiagramOptions } from '../diagram/types';
import type { DiagramModel, LinkModel, NodeModel } from '../model/types';
import type { SymbolDef } from '../symbols/types';

const valve: SymbolDef = {
  type: 't/valve',
  name: 'Valve',
  category: 'T',
  size: { width: 40, height: 20 },
  ports: [
    { id: 'in', position: { x: 0, y: 10 }, direction: 'left' },
    { id: 'out', position: { x: 40, y: 10 }, direction: 'right' },
  ],
  render: ({ data }) => `<rect width="40" height="20" data-open="${String(data.open !== false)}"/>`,
};

/** A grid of `cols × rows` valves 100 apart, chained left to right in each row. */
function grid(cols: number, rows: number): DiagramModel {
  const nodes: NodeModel[] = [];
  const links: LinkModel[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      nodes.push({ id: `n${r}-${c}`, type: 't/valve', position: { x: c * 100, y: r * 100 } });
      if (c > 0) {
        links.push({
          id: `l${r}-${c}`,
          from: { node: `n${r}-${c - 1}`, port: 'out' },
          to: { node: `n${r}-${c}`, port: 'in' },
          kind: 'process',
        });
      }
    }
  return { version: 2, nodes, links };
}

let container: HTMLDivElement;
let d: Diagram;
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

const mount = (model: DiagramModel, opts: DiagramOptions = {}) => {
  d = new Diagram({
    symbols: [valve],
    fitOnLoad: 'never',
    initialViewport: { x: 0, y: 0, zoom: 1 },
    ...opts,
  });
  d.load(model);
  d.mount(container);
  d.renderer!.flush();
  d.culling!.update();
  return d;
};
const nodeEl = (id: string) => container.querySelector(`[data-node-id="${id}"]`) as SVGGElement;
const hidden = (el: Element) => (el as SVGElement).style.display === 'none';

describe('culling (FR-55)', () => {
  it('hides off-screen nodes and links above the threshold, keeps a margin', () => {
    mount(grid(20, 20)); // 400 nodes, 2000×2000; viewport 800×600 (+200 px margin)
    expect(d.culling!.isActive()).toBe(true);
    expect(hidden(nodeEl('n0-0'))).toBe(false);
    expect(hidden(nodeEl('n7-9'))).toBe(false); // inside the margin (y 700 < 800)
    expect(hidden(nodeEl('n15-15'))).toBe(true);
    const far = container.querySelector('[data-link-id="l15-15"]') as SVGElement;
    expect(hidden(far)).toBe(true);
    expect(d.culling!.culledCount).toBeGreaterThan(200);
  });

  it('is off below the threshold, and can be disabled or tuned', () => {
    mount(grid(10, 10)); // 100 nodes
    expect(d.culling!.isActive()).toBe(false);
    d.destroy();
    mount(grid(20, 20), { culling: false });
    expect(d.culling!.isActive()).toBe(false);
    expect(hidden(nodeEl('n15-15'))).toBe(false);
    d.destroy();
    mount(grid(10, 10), { culling: { threshold: 50 } });
    expect(d.culling!.isActive()).toBe(true);
  });

  it('defers data ticks of culled nodes and catches up when they scroll into view', () => {
    mount(grid(20, 20));
    const symbol = () => nodeEl('n15-15').querySelector('.pv-symbol')!.innerHTML;
    const before = symbol();
    d.setNodeData('n15-15', { open: false });
    d.renderer!.flush();
    expect(symbol()).toBe(before); // culled: no DOM work
    d.setViewport({ x: -1300, y: -1300, zoom: 1 });
    d.culling!.update();
    expect(hidden(nodeEl('n15-15'))).toBe(false);
    expect(symbol()).toContain('data-open="false"');
  });

  // Mounts 400 nodes, serializes the whole diagram and parses it back: about 1.4 s in the simulated
  // DOM, and over vitest's default 5 s on a busy machine. 30 s leaves room; a real hang still fails.
  it('exports culled items too', { timeout: 30_000 }, () => {
    mount(grid(20, 20));
    const svg = d.exportSVG();
    expect(svg).toContain('data-node-id="n15-15"');
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(doc.querySelector('[data-node-id="n15-15"]')!.getAttribute('display')).toBeNull();
    expect(hidden(nodeEl('n15-15'))).toBe(true); // culled again afterwards
  });

  it('keyboard focus reveals a culled node', () => {
    mount(grid(20, 20));
    d.keyboard!.setFocused('n15-15');
    expect(hidden(nodeEl('n15-15'))).toBe(false);
  });
});

describe('level of detail (FR-55)', () => {
  const cls = () => [...d.view!.root.classList].filter((c) => c.startsWith('pv-lod-')).sort();

  it('is on by default for culled (large) diagrams, below the zoom thresholds', () => {
    mount(grid(20, 20));
    expect(cls()).toEqual([]);
    d.setViewport({ zoom: 0.3 });
    d.culling!.update();
    expect(cls()).toEqual(['pv-lod-labels', 'pv-lod-overlays', 'pv-lod-ports']);
  });

  it('is off by default for small diagrams; configurable; lod:false disables', () => {
    mount(grid(5, 5));
    d.setViewport({ zoom: 0.2 });
    d.culling!.update();
    expect(cls()).toEqual([]);
    d.destroy();
    mount(grid(5, 5), { lod: { labels: 0.5 } });
    d.setViewport({ zoom: 0.45 });
    d.culling!.update();
    expect(cls()).toEqual(['pv-lod-labels', 'pv-lod-ports']);
    d.destroy();
    mount(grid(20, 20), { lod: false });
    d.setViewport({ zoom: 0.1 });
    d.culling!.update();
    expect(cls()).toEqual([]);
  });
});
