import type { DemoStatus } from './ReadingCard';

/** One simulated instrument: a bounded random walk plus the demo's own status rule. */
interface Channel {
  id: string;
  value: number;
  min: number;
  max: number;
  step: number;
  status: (v: number) => DemoStatus;
}

export interface Tick {
  readings: Record<string, { value: number; status: DemoStatus }>;
  levels: Record<string, number>;
  pumps: Record<string, boolean>;
}

/** Deterministic PRNG so runs (and screenshots of the first tick) are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Simulated plant data at 1 Hz. Status thresholds live here, in the demo, because the library has no
 * alarm model. The initial values match the Figma frame.
 */
export function createSimulator(seed = 1) {
  const rand = mulberry32(seed);
  const channels: Channel[] = [
    {
      id: 'TI-101',
      value: 14.0,
      min: 11,
      max: 19,
      step: 0.3,
      status: (v) => (v < 12 ? 'warning' : 'normal'),
    },
    { id: 'FI-103', value: 1.1, min: 0.6, max: 1.6, step: 0.05, status: () => 'normal' },
    {
      id: 'FI-101',
      value: 2.1,
      min: 1.6,
      max: 4.2,
      step: 0.15,
      status: (v) => (v < 2.5 ? 'alarm' : 'normal'),
    },
    {
      id: 'TI-102',
      value: 12.9,
      min: 11.5,
      max: 17,
      step: 0.2,
      status: (v) => (v < 13.5 ? 'warning' : 'normal'),
    },
  ];
  const levels: Record<string, number> = { MHWT: 0.62, MPAT: 0.35, MRM: 0.48, MHT: 0.71 };
  let n = 0;
  /** FI-103 drops out for a few ticks every half minute to show the stale state. */
  const staleFor = (t: number) => t % 30 >= 24;

  return {
    next(): Tick {
      n++;
      const readings: Tick['readings'] = {};
      for (const c of channels) {
        const drift = (rand() - 0.5) * 2 * c.step;
        c.value = Math.min(c.max, Math.max(c.min, c.value + drift));
        const stale = c.id === 'FI-103' && staleFor(n);
        readings[c.id] = { value: c.value, status: stale ? 'stale' : c.status(c.value) };
      }
      for (const k of Object.keys(levels)) {
        levels[k] = Math.min(0.95, Math.max(0.1, levels[k]! + (rand() - 0.5) * 0.02));
      }
      return { readings, levels: { ...levels }, pumps: { P03: true, P102: n % 60 < 55 } };
    },
  };
}
