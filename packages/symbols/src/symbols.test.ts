import { SymbolRegistry, type SymbolDef } from '@pipeline-view/core';
import { describe, expect, it } from 'vitest';
import {
  ACTUATION,
  EQUIPMENT,
  INSTRUMENTATION,
  PIPING,
  PROCESS,
  VALVES,
  flowIndicatingController,
  gasSymbols,
  gateValve,
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
  it('ships 50 gas symbols numbered 01–50 in order, plus 3 process symbols', () => {
    expect(gasSymbols.map((d) => d.ref)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    expect(processSymbols.map((d) => d.type)).toEqual([
      'process/tank',
      'process/pump',
      'process/control-valve',
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
    for (const d of processSymbols) expect(d.category).toBe(PROCESS);
  });

  describe.each(all.map((d) => [d.type, d] as const))('%s', (_type, def) => {
    it('has at least one port, unique port ids, and every port inside its bounds', () => {
      expect(def.ports.length).toBeGreaterThan(0);
      expect(new Set(def.ports.map((p) => p.id)).size).toBe(def.ports.length);
      for (const p of def.ports) {
        expect(p.position.x).toBeGreaterThanOrEqual(0);
        expect(p.position.y).toBeGreaterThanOrEqual(0);
        expect(p.position.x).toBeLessThanOrEqual(def.size.width);
        expect(p.position.y).toBeLessThanOrEqual(def.size.height);
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
          expect(n).toBeLessThanOrEqual(Math.max(def.size.width, def.size.height));
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

describe('registration helpers', () => {
  it('registers every symbol into a registry', () => {
    const registry = new SymbolRegistry();
    registerGasSymbols(registry);
    registerProcessSymbols(registry);
    expect(registry.list()).toHaveLength(53);
    expect(registry.get('gas/ball-valve')?.ref).toBe(2);
  });
});
