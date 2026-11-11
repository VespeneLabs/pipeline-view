import { SymbolRegistry, nodePorts, nodeSize, type SymbolDef } from '@pipeline-view/core';
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
  inlineInstrument,
  offPageInlet,
  offPageOutlet,
  pressureTransmitter,
  processSymbols,
  pump,
  registerGasSymbols,
  registerProcessSymbols,
  tank,
} from './index';

const all: SymbolDef[] = [...gasSymbols, ...processSymbols];
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
  it('ships 50 gas symbols numbered 01–50 in order, plus 9 process symbols', () => {
    expect(gasSymbols.map((d) => d.ref)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    expect(processSymbols.map((d) => d.type)).toEqual([
      'process/tank',
      'process/conical-tank',
      'process/pump',
      'process/control-valve',
      'process/off-page-inlet',
      'process/off-page-outlet',
      'process/inline-instrument',
      'process/header',
      'process/burner',
    ]);
  });

  it('has unique, namespaced type ids', () => {
    const types = all.map((d) => d.type);
    expect(new Set(types).size).toBe(types.length);
    for (const d of gasSymbols) expect(d.type).toMatch(/^gas\/[a-z0-9]+(?:-[a-z0-9]+)*$/);
    for (const d of processSymbols) expect(d.type).toMatch(/^process\/[a-z0-9-]+$/);
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
});

describe('registration helpers', () => {
  it('registers every symbol into a registry', () => {
    const registry = new SymbolRegistry();
    registerGasSymbols(registry);
    registerProcessSymbols(registry);
    expect(registry.list()).toHaveLength(59);
    expect(registry.get('gas/ball-valve')?.ref).toBe(2);
  });
});
