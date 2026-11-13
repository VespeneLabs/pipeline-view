import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Diagram } from '../diagram/diagram';
import type { DiagramModel, NodeModel } from '../model/types';
import { symbolMarkup, symbolSvg } from '../symbols/resolve';
import type { SymbolDef } from '../symbols/types';

/** A body in a horizontal line with a tap at the bottom that may also leave from the top. */
const body: SymbolDef = {
  type: 'test/body',
  name: 'Body',
  category: 'Test',
  size: { width: 40, height: 40 },
  ports: [
    { id: 'in', position: { x: 0, y: 20 }, direction: 'left' },
    { id: 'out', position: { x: 40, y: 20 }, direction: 'right' },
    {
      id: 'tap',
      position: { x: 20, y: 40 },
      direction: 'bottom',
      alternates: [{ position: { x: 20, y: 0 }, direction: 'top' }],
    },
  ],
  svg: '<rect width="40" height="40"/>',
};
const gauge: SymbolDef = {
  type: 'test/gauge',
  name: 'Gauge',
  category: 'Test',
  size: { width: 20, height: 20 },
  ports: [{ id: 'tap', position: { x: 10, y: 20 }, direction: 'bottom' }],
  render: ({ data, status }) =>
    `<path d="M0 0H${Number(data.level ?? 0) * 20}" data-s="${status ?? ''}"/>`,
};

const model = (nodes: Partial<NodeModel>[] = []): DiagramModel => ({
  version: 2,
  nodes: [
    { id: 'r', type: 'test/body', position: { x: 200, y: 200 }, label: 'PCV-1', ...nodes[0] },
    { id: 'above', type: 'test/gauge', position: { x: 210, y: 60 }, ...nodes[1] },
    { id: 'below', type: 'test/gauge', position: { x: 300, y: 400 }, rotation: 180, ...nodes[2] },
  ],
  links: [
    {
      id: 'up',
      from: { node: 'r', port: 'tap' },
      to: { node: 'above', port: 'tap' },
      kind: 'signal',
    },
    {
      id: 'down',
      from: { node: 'r', port: 'tap' },
      to: { node: 'below', port: 'tap' },
      kind: 'signal',
    },
  ],
});

let container: HTMLDivElement;
let d: Diagram;
const flush = () => d.renderer!.flush();
const label = (id: string) => container.querySelector(`[data-node-id="${id}"] .pv-label`)!;

function start(m: DiagramModel) {
  d = new Diagram({ symbols: [body, gauge] });
  d.load(m);
  d.mount(container);
  flush();
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(() => {
  d?.destroy();
  container.remove();
});

describe('node label side', () => {
  it('draws the label on the given side with a matching text anchor, and moves it on change', () => {
    start(model([{ labelPosition: 'right' }]));
    expect(label('r').getAttribute('text-anchor')).toBe('start');
    expect(label('r').getAttribute('x')).toBe('246');
    d.update((tx) => tx.updateNode('r', { labelPosition: 'top' }));
    flush();
    expect(label('r').getAttribute('text-anchor')).toBe('middle');
    expect(label('r').getAttribute('y')).toBe('193');
    d.update((tx) => tx.updateNode('r', { labelPosition: undefined }));
    flush();
    expect(label('r').getAttribute('y')).toBe('256');
  });

  it('counts a label beside the node in the bounds', () => {
    start(model([{ labelPosition: 'left', label: 'ABCDEFGHIJ' }]));
    expect(d.getBounds().x).toBe(200 - 6 - 85);
  });
});

describe('port alternates', () => {
  it('draws each link from the place facing its other end, without changing the model', () => {
    start(model());
    expect(d.getLinkPath('up')![0]).toEqual({ x: 220, y: 200 });
    expect(d.getLinkPath('down')![0]).toEqual({ x: 220, y: 240 });
    expect(d.toJSON().links.map((l) => l.from.port)).toEqual(['tap', 'tap']);
  });

  it('moves the end over when the other node changes sides', () => {
    start(model());
    d.update((tx) => tx.updateNode('above', { position: { x: 210, y: 400 }, rotation: 180 }));
    flush();
    expect(d.getLinkPath('up')![0]).toEqual({ x: 220, y: 240 });
  });
});

describe('symbolSvg', () => {
  it('draws a symbol with its data as a stand-alone svg, scaled from one side', () => {
    expect(symbolMarkup(body)).toBe(body.svg);
    expect(symbolMarkup(gauge, { data: { level: 0.5 }, status: 'low' })).toBe(
      '<path d="M0 0H10" data-s="low"/>',
    );
    const svg = symbolSvg(body, { height: 20, status: 'a"b' });
    expect(svg).toContain('viewBox="0 0 40 40" width="20" height="20"');
    expect(svg).toContain('data-status="a&#34;b"');
    expect(symbolSvg(gauge)).toContain('width="20" height="20"');
    expect(symbolSvg(gauge)).not.toContain('data-status');
  });
});
