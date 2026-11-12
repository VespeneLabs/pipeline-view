import {
  SymbolRegistry,
  nodePorts,
  nodeSize,
  type NodeModel,
  type SymbolDef,
} from '@pipeline-view/core';
import { describe, expect, it } from 'vitest';
import {
  ACTUATION,
  EQUIPMENT,
  INSTRUMENTATION,
  PIPING,
  PROCESS,
  VALVES,
  conicalTank,
  flowIndicatingController,
  gasSymbols,
  gateValve,
  header,
  enclosure,
  inlineInstrument,
  instrumentBubble,
  offPageInlet,
  outletPoint,
  offPageOutlet,
  pidSymbols,
  pressureTransmitter,
  processSymbols,
  pump,
  registerGasSymbols,
  registerPidSymbols,
  registerProcessSymbols,
  tank,
} from './index';

const all: SymbolDef[] = [...gasSymbols, ...processSymbols, ...pidSymbols];
const CATEGORIES = [VALVES, ACTUATION, EQUIPMENT, INSTRUMENTATION, PIPING];

/** Anything that looks like a literal color: hex, rgb()/hsl(), or a named color in a paint attribute. */
const HARD_CODED_COLOR =
  /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(|(?:fill|stroke|color)\s*[=:]\s*["']?(?!none|currentColor|var\(|transparent)[a-z]/i;

function parse(markup: string): Document {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`,
    'image/svg+xml',
  );
  expect(doc.querySelector('parsererror')).toBeNull();
  return doc;
}

function samples(def: SymbolDef): string[] {
  const out = [def.svg ?? ''];
  if (def.render) {
    for (const data of [
      {},
      { open: false },
      { open: true },
      { running: true },
      { level: 0.5 },
      { letters: 'PIC', loop: 7 },
    ]) {
      out.push(def.render({ data }));
    }
  }
  return out;
}

describe('symbol definitions', () => {
  it('ships 50 gas symbols numbered 01–50 in order, plus 12 process symbols', () => {
    expect(gasSymbols.map((d) => d.ref)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    expect(processSymbols.map((d) => d.type)).toEqual([
      'process/tank',
      'process/conical-tank',
      'process/pump',
      'process/control-valve',
      'process/off-page-inlet',
      'process/off-page-outlet',
      'process/inline-instrument',
      'process/instrument',
      'process/header',
      'process/burner',
      'process/enclosure',
      'process/outlet-point',
    ]);
  });

  it('has unique, namespaced type ids', () => {
    const types = all.map((d) => d.type);
    expect(new Set(types).size).toBe(types.length);
    for (const d of gasSymbols) expect(d.type).toMatch(/^gas\/[a-z0-9]+(?:-[a-z0-9]+)*$/);
    for (const d of processSymbols) expect(d.type).toMatch(/^process\/[a-z0-9-]+$/);
    for (const d of pidSymbols) expect(d.type).toMatch(/^pid\/[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('ships the extended P&ID pack: 165 symbols, unnumbered, spread over the six categories', () => {
    expect(pidSymbols).toHaveLength(165);
    expect(pidSymbols.every((d) => d.ref === undefined)).toBe(true);
    const count = (cat: string) => pidSymbols.filter((d) => d.category === cat).length;
    expect([...CATEGORIES, PROCESS].map(count)).toEqual([14, 27, 31, 24, 38, 31]);
    expect(new Set(pidSymbols.map((d) => d.name)).size).toBe(165);
  });

  it('uses the Figma section titles as categories, ten symbols each', () => {
    CATEGORIES.forEach((cat, i) => {
      const refs = gasSymbols.filter((d) => d.category === cat).map((d) => d.ref);
      expect(refs).toEqual(Array.from({ length: 10 }, (_, k) => i * 10 + k + 1));
    });
    for (const d of processSymbols)
      expect([PROCESS, PIPING, INSTRUMENTATION]).toContain(d.category);
  });

  describe.each(all.map((d) => [d.type, d] as const))('%s', (_type, def) => {
    it('has at least one port, unique port ids, and every port inside its bounds', () => {
      const ports = nodePorts(def);
      const size = nodeSize(def);
      expect(ports.length).toBeGreaterThan(0);
      expect(new Set(ports.map((p) => p.id)).size).toBe(ports.length);
      for (const p of ports) {
        expect(p.position.x).toBeGreaterThanOrEqual(0);
        expect(p.position.y).toBeGreaterThanOrEqual(0);
        expect(p.position.x).toBeLessThanOrEqual(size.width);
        expect(p.position.y).toBeLessThanOrEqual(size.height);
      }
    });

    it('renders well-formed markup without hard-coded colors', () => {
      for (const markup of samples(def)) {
        expect(markup).not.toMatch(HARD_CODED_COLOR);
        expect(markup).not.toMatch(/<svg|clip-path|\bid=/);
        parse(markup);
      }
    });

    it('keeps geometry inside its bounds', () => {
      const numbers = (def.svg ?? '').matchAll(/ d="([^"]+)"/g);
      for (const [, d] of numbers) {
        const pts = d!.match(/-?\d*\.?\d+/g)!.map(Number);
        for (const n of pts) {
          expect(n).toBeGreaterThanOrEqual(0);
          expect(n).toBeLessThanOrEqual(Math.max(nodeSize(def).width, nodeSize(def).height));
        }
      }
    });
  });
});

describe('bindable parts', () => {
  it('fills a valve body when closed', () => {
    expect(gateValve.render!({ data: {} })).toBe(gateValve.svg);
    expect(gateValve.render!({ data: { open: false } })).toContain('fill="currentColor"');
  });

  it('fills the pump impeller while running', () => {
    expect(pump.render!({ data: { running: false } })).toBe(pump.svg);
    expect(pump.render!({ data: { running: true } })).toContain('fill="currentColor"');
  });

  it('draws the tank level clamped to 0..1', () => {
    expect(tank.render!({ data: { level: 0 } })).toBe(tank.svg);
    expect(tank.render!({ data: { level: 0.5 } })).toContain('M22 63H78');
    expect(tank.render!({ data: { level: 7 } })).toContain('M22 26H78');
  });

  it('fills the cone-bottom tank through the cone below the cylinder', () => {
    expect(conicalTank.render!({ data: { level: 1 } })).toContain('M22 26H78V84L50 114L22 84Z');
    // 10 %: the liquid sits inside the cone only (y = 105.2, half-width 8.21).
    expect(conicalTank.render!({ data: { level: 0.1 } })).toContain('M41.79 105.2H58.21L50 114Z');
  });

  it('takes instrument tag letters and loop number from data, escaped', () => {
    const svg = pressureTransmitter.render!({ data: { letters: 'PIT', loop: 204 } });
    expect(svg).toContain('>PIT</text>');
    expect(svg).toContain('>204</text>');
    expect(flowIndicatingController.render!({ data: {} })).toContain('>101</text>');
    const hostile = pressureTransmitter.render!({ data: { letters: '<img onerror=x>' } });
    expect(hostile).not.toContain('<img');
    expect(hostile).toContain('&lt;img onerror=x&gt;');
  });
});

describe('round-3 process symbols', () => {
  it('off-page connectors: one port in flow direction, tag text from data, escaped', () => {
    expect(nodePorts(offPageInlet).map((p) => [p.id, p.role])).toEqual([['out', 'out']]);
    expect(nodePorts(offPageOutlet).map((p) => [p.id, p.role])).toEqual([['in', 'in']]);
    expect(offPageInlet.render!({ data: {} })).toBe(offPageInlet.svg);
    expect(offPageInlet.render!({ data: { text: 'N2' } })).toContain('>N2</text>');
    expect(offPageOutlet.render!({ data: { text: '<b>' } })).toContain('&lt;b&gt;');
  });

  it('off-page connectors grow with a long tag and keep the port on the tip', () => {
    const node = (type: string, text?: string): NodeModel => ({
      id: 'n',
      type,
      position: { x: 0, y: 0 },
      ...(text === undefined ? {} : { data: { text } }),
    });
    // Short tags and previews keep the original 96 px shape.
    expect(nodeSize(offPageInlet)).toEqual({ width: 96, height: 36 });
    expect(nodeSize(offPageInlet, node(offPageInlet.type, 'GAS'))).toEqual({
      width: 96,
      height: 36,
    });
    expect(nodePorts(offPageInlet)[0]!.position).toEqual({ x: 95, y: 18 });
    expect(offPageInlet.render!({ data: { text: 'GAS' } })).toContain('M1 1H74L95 18L74 35H1Z');

    const long = node(offPageInlet.type, 'DWG-1042-A01');
    const { width } = nodeSize(offPageInlet, long);
    expect(width).toBeGreaterThan(12 * 8);
    expect(nodePorts(offPageInlet, long)[0]!.position).toEqual({ x: width - 1, y: 18 });
    const drawn = offPageInlet.render!({ data: { text: 'DWG-1042-A01' } });
    expect(drawn).toContain(`L${width - 1} 18`);
    expect(drawn).toContain(`x="${40 + (width - 96) / 2}"`);
    // The outlet's port stays on its left edge.
    expect(nodePorts(offPageOutlet, node(offPageOutlet.type, 'DWG-1042-A01'))[0]!.position).toEqual(
      {
        x: 1,
        y: 18,
      },
    );
  });

  it('inline instrument: pipe ports in/out, letters and loop from data, optional flow-element bars', () => {
    const ports = nodePorts(inlineInstrument);
    expect(ports.filter((p) => p.role).map((p) => [p.id, p.role])).toEqual([
      ['in', 'in'],
      ['out', 'out'],
    ]);
    expect(ports[0]!.position.y).toBe(ports[1]!.position.y);
    const svg = inlineInstrument.render!({ data: { letters: 'PT', loop: 12 } });
    expect(svg).toContain('>PT</text>');
    expect(svg).toContain('>12</text>');
    expect(svg).not.toContain('M35 71V87');
    expect(inlineInstrument.render!({ data: { flowElement: true } })).toContain('M35 71V87');
  });

  it('header: port counts and size from data, indexed labels, clamped counts', () => {
    const node = (data: Record<string, unknown>) => ({
      id: 'h',
      type: 'process/header',
      position: { x: 0, y: 0 },
      data,
    });
    const ports = nodePorts(header, node({ inlets: 2, outlets: 8 }));
    expect(ports.map((p) => p.id)).toEqual([
      'in-1',
      'in-2',
      ...Array.from({ length: 8 }, (_, i) => `out-${i + 1}`),
    ]);
    expect(ports.find((p) => p.id === 'out-8')).toMatchObject({
      label: '8',
      labelPlacement: 'outside',
    });
    const size = nodeSize(header, node({ inlets: 2, outlets: 8 }));
    expect(size.height).toBe(9 * 24);
    // Outlets are evenly spaced, top to bottom.
    const ys = ports.filter((p) => p.role === 'out').map((p) => p.position.y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
    expect(nodePorts(header, node({ outlets: 0 })).filter((p) => p.role === 'out')).toHaveLength(1);
    expect(nodePorts(header, node({ outlets: 1e6 })).filter((p) => p.role === 'out')).toHaveLength(
      32,
    );
    expect(header.render!({ data: { inlets: 2, outlets: 8 } })).toContain('height="212"');
  });

  it('header: valves on every outlet, with size and ports unchanged', () => {
    const node = (data: Record<string, unknown>) => ({
      id: 'h',
      type: 'process/header',
      position: { x: 0, y: 0 },
      data,
    });
    const plain = node({ inlets: 1, outlets: 4 });
    const valved = node({ inlets: 1, outlets: 4, valves: true });
    expect(nodeSize(header, valved)).toEqual(nodeSize(header, plain));
    expect(nodePorts(header, valved)).toEqual(nodePorts(header, plain));
    const svg = header.render!({ data: valved.data });
    // One valve body per outlet, centred on its stub.
    const ys = nodePorts(header, valved)
      .filter((p) => p.role === 'out')
      .map((p) => p.position.y);
    for (const y of ys) expect(svg).toContain(`M23 ${y - 6}L37 ${y + 6}V${y - 6}L23 ${y + 6}Z`);
    expect(svg.match(/L37 /g)).toHaveLength(4);
    // The body moves left inside the same box to make room; the stubs still reach both edges.
    expect(svg).toContain('<rect x="5"');
    expect(svg).toContain(`M19 ${ys[0]}H40`);
    expect(header.render!({ data: plain.data })).not.toContain('L37 ');
    // Only `true` turns them on, also on the default counts.
    expect(header.render!({ data: { valves: 'yes' as unknown as boolean } })).toBe(header.svg);
    expect(header.render!({ data: { valves: true } })).not.toBe(header.svg);
  });

  it('enclosure: one outlet with a role, a tag from data that widens the box, escaped', () => {
    const node = (text?: string): NodeModel => ({
      id: 'e',
      type: enclosure.type,
      position: { x: 0, y: 0 },
      ...(text === undefined ? {} : { data: { text } }),
    });
    expect(nodeSize(enclosure)).toEqual({ width: 72, height: 64 });
    expect(nodePorts(enclosure)).toEqual([
      { id: 'out', position: { x: 72, y: 32 }, direction: 'right', role: 'out' },
    ]);
    expect(enclosure.render!({ data: {} })).toBe(enclosure.svg);
    expect(enclosure.svg).not.toContain('<text');
    const short = enclosure.render!({ data: { text: 'GC-1' } });
    expect(short).toContain('>GC-1</text>');
    expect(nodeSize(enclosure, node('GC-1')).width).toBe(72);
    // A long tag widens the box; the port stays on the end of the stub.
    const { width } = nodeSize(enclosure, node('CABINET-N2-014'));
    expect(width).toBeGreaterThan(14 * 8);
    expect(nodePorts(enclosure, node('CABINET-N2-014'))[0]!.position).toEqual({ x: width, y: 32 });
    const long = enclosure.render!({ data: { text: 'CABINET-N2-014' } });
    expect(long).toContain(`H${width}`);
    expect(long).toContain(`x="${(width - 12 + 1) / 2}"`);
    expect(enclosure.render!({ data: { text: '<b>' } })).toContain('&lt;b&gt;');
  });

  it('point-of-use outlet: one inlet with a role, inside its box', () => {
    expect(nodePorts(outletPoint)).toEqual([
      { id: 'in', position: { x: 0, y: 12 }, direction: 'left', role: 'in' },
    ]);
    expect(nodeSize(outletPoint)).toEqual({ width: 38, height: 24 });
    expect(outletPoint.svg).toContain('M0 12H14');
  });
});

describe('extended P&ID pack', () => {
  const byType = (type: string) => pidSymbols.find((d) => d.type === type)!;

  it('fills a two-way valve body when closed, with or without an actuator', () => {
    for (const type of ['pid/pinch-valve', 'pid/motor-operated-gate-valve', 'pid/four-way-valve']) {
      const def = byType(type);
      expect(def.render!({ data: {} })).toBe(def.svg);
      expect(def.render!({ data: { open: false } })).not.toBe(def.svg);
    }
  });

  it('puts the line ports of in-line symbols on one level, at the left and right edges', () => {
    for (const type of ['pid/turbine-meter', 'pid/insulating-joint', 'pid/spectacle-blind']) {
      const def = byType(type);
      const [a, b] = nodePorts(def);
      expect([a!.id, b!.id]).toEqual(['in', 'out']);
      expect(a!.position.y).toBe(b!.position.y);
      expect([a!.position.x, b!.position.x]).toEqual([1, nodeSize(def).width - 1]);
    }
  });

  it('takes the letters and loop of a located instrument bubble from data, escaped', () => {
    const def = byType('pid/shared-display-instrument');
    expect(def.svg).toContain('>FIC</text>');
    const svg = def.render!({ data: { letters: 'LIC', loop: 12 } });
    expect(svg).toContain('>LIC</text>');
    expect(svg).toContain('>12</text>');
    expect(def.render!({ data: { letters: '<b>' } })).toContain('&lt;b&gt;');
  });

  it('limits signal lines to their own link kind', () => {
    expect(nodePorts(byType('pid/hydraulic-signal'))[0]!.accepts).toEqual(['hydraulic']);
    expect(nodePorts(byType('pid/heat-traced-line'))[0]!.accepts).toBeUndefined();
  });
});

describe('generic instrument bubble', () => {
  const node = (data?: Record<string, unknown>): NodeModel => ({
    id: 'n',
    type: instrumentBubble.type,
    position: { x: 0, y: 0 },
    ...(data ? { data } : {}),
  });
  const draw = (data: Record<string, unknown>) => instrumentBubble.render!({ data });
  const CIRCLE = 'M31 61C47.5685';
  const SQUARE = 'M1 1H61V61H1Z';

  it('draws a field-mounted circle on a tap stem by default', () => {
    expect(draw({})).toBe(instrumentBubble.svg);
    expect(instrumentBubble.svg).toContain(CIRCLE);
    expect(instrumentBubble.svg).toContain('M31 61V79');
    expect(instrumentBubble.svg).not.toContain('M1 31H61');
    expect(nodeSize(instrumentBubble)).toEqual({ width: 62, height: 80 });
    expect(nodePorts(instrumentBubble).map((p) => p.id)).toEqual(['tap', 'signal', 'input']);
  });

  it('draws the outline of each device', () => {
    expect(draw({ device: 'shared' })).toContain(SQUARE + CIRCLE);
    expect(draw({ device: 'computer' })).toContain('M1 31L16 1H46L61 31L46 61H16Z');
    expect(draw({ device: 'plc' })).toContain(SQUARE + 'M31 1L61 31L31 61L1 31Z');
    expect(draw({ device: 'computer' })).not.toContain(CIRCLE);
  });

  it('draws the line of each location', () => {
    expect(draw({ location: 'panel' })).toContain('<path d="M1 31H61"/>');
    expect(draw({ location: 'behind-panel' })).toContain(
      '<path d="M1 31H61" stroke-dasharray="5 4"/>',
    );
    expect(draw({ location: 'local-panel' })).toContain('<path d="M1.2 28H60.8M1.2 34H60.8"/>');
    expect(draw({ location: 'behind-local-panel' })).toContain(
      '<path d="M1.2 28H60.8M1.2 34H60.8" stroke-dasharray="5 4"/>',
    );
    // The double line is cut to a diamond's width.
    expect(draw({ device: 'plc', location: 'local-panel' })).toContain('M4 28H58M4 34H58');
  });

  it('writes letters, loop and the qualifiers outside the bubble, escaped', () => {
    const svg = draw({ letters: 'LSHH', loop: 12, high: 'HH', low: '<L>' });
    expect(svg).toContain('>LSHH</text>');
    expect(svg).toContain('>12</text>');
    expect(svg).toContain('<text x="56" y="10" text-anchor="start"');
    expect(svg).toContain('>HH</text>');
    expect(svg).toContain('&lt;L&gt;');
    expect(svg).not.toContain('<L>');
    // Beyond a square outline, not in its corner.
    expect(draw({ device: 'shared', high: 'H' })).toContain('<text x="65" y="10"');
  });

  it('falls back to the defaults for unknown values', () => {
    expect(draw({ device: 'triangle', location: 'moon', mounting: 'glue' })).toBe(
      instrumentBubble.svg,
    );
    expect(draw({ letters: '', loop: '' })).toBe(instrumentBubble.svg);
  });

  it('mounting decides the size and the process ports, and keeps the signal port ids', () => {
    const alone = node({ mounting: 'none' });
    expect(nodeSize(instrumentBubble, alone)).toEqual({ width: 62, height: 62 });
    expect(nodePorts(instrumentBubble, alone).map((p) => p.id)).toEqual(['signal', 'input']);
    expect(draw({ mounting: 'none' })).not.toContain('M31 61V79');

    const inline = node({ mounting: 'inline' });
    expect(nodeSize(instrumentBubble, inline)).toEqual({ width: 80, height: 88 });
    expect(nodePorts(instrumentBubble, inline).map((p) => [p.id, p.role])).toEqual([
      ['in', 'in'],
      ['out', 'out'],
      ['signal', undefined],
      ['input', undefined],
    ]);
    // The pipe runs through, and the bubble's ports move with the bubble.
    expect(draw({ mounting: 'inline' })).toContain('M0 79H80');
    // Flow-element bars, as on the inline instrument; they belong to the pipe, so only when in the line.
    expect(draw({ mounting: 'inline' })).not.toContain('M35 71V87');
    expect(draw({ mounting: 'inline', flowElement: true })).toBe(
      inlineInstrument.render!({ data: { letters: 'PI', flowElement: true } }),
    );
    expect(draw({ flowElement: true })).toBe(instrumentBubble.svg);
    expect(nodePorts(instrumentBubble, inline).find((p) => p.id === 'signal')!.position).toEqual({
      x: 70,
      y: 31,
    });
    for (const p of nodePorts(instrumentBubble, inline)) {
      expect(p.position.x).toBeLessThanOrEqual(80);
      expect(p.position.y).toBeLessThanOrEqual(88);
    }
  });

  it('every bubble symbol is a preset of the same drawing', () => {
    // A gas transmitter told it sits on a panel draws what the panel symbol draws.
    expect(
      pressureTransmitter.render!({ data: { letters: 'FIC', loop: 101, location: 'panel' } }),
    ).toBe(flowIndicatingController.svg);
    const shared = pidSymbols.find((d) => d.type === 'pid/shared-display-instrument')!;
    expect(draw({ letters: 'FIC', device: 'shared', location: 'panel' })).toBe(shared.svg);
    expect(inlineInstrument.render!({ data: { location: 'panel' } })).toContain('M1 31H61');
    // Presets keep their own ports whatever the data says.
    expect(nodePorts(pressureTransmitter).map((p) => p.id)).toEqual(['tap', 'signal']);
    expect(nodePorts(shared).map((p) => p.id)).toEqual(['tap', 'signal', 'input']);
  });
});

describe('registration helpers', () => {
  it('registers every symbol into a registry', () => {
    const registry = new SymbolRegistry();
    registerGasSymbols(registry);
    registerProcessSymbols(registry);
    expect(registry.list()).toHaveLength(62);
    registerPidSymbols(registry);
    expect(registry.list()).toHaveLength(227);
    expect(registry.get('pid/insulating-joint')?.name).toBe('Insulating joint');
    expect(registry.get('gas/ball-valve')?.ref).toBe(2);
  });
});
