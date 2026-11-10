import type { DiagramModel, SymbolDef } from '@pipeline-view/core';

/**
 * Node types drawn by React components. A symbol definition still declares the size and the ports
 * (the library draws the ports and routes to them); it just has no SVG.
 */
export const readingSymbol: SymbolDef = {
  type: 'demo/reading',
  name: 'Reading card',
  category: 'Demo',
  size: { width: 132, height: 72 },
  ports: [{ id: 'signal', position: { x: 66, y: 72 }, direction: 'bottom', accepts: ['signal'] }],
};

export const unitSymbol: SymbolDef = {
  type: 'demo/unit',
  name: 'Unit card',
  category: 'Demo',
  size: { width: 180, height: 100 },
  ports: [
    { id: 'in', position: { x: 0, y: 50 }, direction: 'left' },
    { id: 'out', position: { x: 180, y: 50 }, direction: 'right' },
    { id: 'signal', position: { x: 90, y: 0 }, direction: 'top', accepts: ['signal'] },
  ],
};

export type ReadingData = {
  tag: string;
  label: string;
  unit: string;
  decimals: number;
  value: number;
  /** Last values, oldest first, for the mini trend. */
  history: number[];
  low?: number;
  high?: number;
};

export type UnitData = {
  title: string;
  inlet: number;
  outlet: number;
};

const reading = (r: Omit<ReadingData, 'history'>): ReadingData => ({
  ...r,
  history: Array.from({ length: 16 }, () => r.value),
});

export const reactNodesModel: DiagramModel = {
  version: 2,
  nodes: [
    {
      id: 'T1',
      type: 'process/tank',
      position: { x: 0, y: 200 },
      label: 'T-101',
      data: { level: 0.62 },
    },
    {
      id: 'P1',
      type: 'process/pump',
      position: { x: 210, y: 224 },
      label: 'P-101',
      data: { running: true },
    },
    { id: 'V1', type: 'process/control-valve', position: { x: 380, y: 219 }, label: 'FCV-101' },
    {
      id: 'E1',
      type: 'demo/unit',
      position: { x: 560, y: 214 },
      data: { title: 'Heat exchanger E-101', inlet: 18.4, outlet: 41.2 } satisfies UnitData,
    },
    {
      id: 'T2',
      type: 'process/tank',
      position: { x: 840, y: 200 },
      label: 'T-102',
      data: { level: 0.35 },
    },
    {
      id: 'LT101',
      type: 'demo/reading',
      position: { x: -16, y: 20 },
      data: reading({ tag: 'LT-101', label: 'Level', unit: '%', decimals: 1, value: 62, low: 20 }),
    },
    {
      id: 'FT101',
      type: 'demo/reading',
      position: { x: 354, y: 20 },
      data: reading({ tag: 'FT-101', label: 'Flow', unit: 'm³/h', decimals: 1, value: 12.4 }),
    },
    {
      id: 'TT102',
      type: 'demo/reading',
      position: { x: 584, y: 20 },
      data: reading({
        tag: 'TT-102',
        label: 'Outlet temp',
        unit: '°C',
        decimals: 1,
        value: 41.2,
        high: 55,
      }),
    },
  ],
  links: [
    {
      id: 'l1',
      from: { node: 'T1', port: 'out' },
      to: { node: 'P1', port: 'suction' },
      kind: 'process',
    },
    {
      id: 'l2',
      from: { node: 'P1', port: 'discharge' },
      to: { node: 'V1', port: 'in' },
      kind: 'process',
    },
    {
      id: 'l3',
      from: { node: 'V1', port: 'out' },
      to: { node: 'E1', port: 'in' },
      kind: 'process',
    },
    {
      id: 'l4',
      from: { node: 'E1', port: 'out' },
      to: { node: 'T2', port: 'in' },
      kind: 'process',
    },
    {
      id: 's1',
      from: { node: 'LT101', port: 'signal' },
      to: { node: 'T1', port: 'top' },
      kind: 'signal',
    },
    {
      id: 's2',
      from: { node: 'FT101', port: 'signal' },
      to: { node: 'V1', port: 'actuator' },
      kind: 'signal',
    },
    {
      id: 's3',
      from: { node: 'TT102', port: 'signal' },
      to: { node: 'E1', port: 'signal' },
      kind: 'signal',
    },
  ],
};

/** Demo-only status rule: the library just passes the string through as data-status. */
export function statusOf(d: ReadingData): 'normal' | 'warning' | 'alarm' {
  if (d.low !== undefined && d.value < d.low) return 'alarm';
  if (d.high !== undefined && d.value > d.high) return 'warning';
  return 'normal';
}

/**
 * A deterministic 1 Hz plant: each sensor changes at its own rate (flow every tick, temperatures every
 * 2nd, level every 3rd), so only those cards re-render.
 */
export function createPlant(seed = 3) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  let tick = 0;
  const state = { level: 62, flow: 12.4, inlet: 18.4, outlet: 41.2 };
  return {
    next() {
      tick++;
      const changed: string[] = ['FT101'];
      state.flow = Math.max(4, Math.min(20, state.flow + (rnd() - 0.5) * 1.6));
      if (tick % 2 === 0) {
        state.inlet = 18 + rnd() * 1.5;
        state.outlet = Math.max(30, Math.min(60, state.outlet + (rnd() - 0.45) * 3));
        changed.push('TT102', 'E1');
      }
      if (tick % 3 === 0) {
        state.level = Math.max(10, Math.min(95, state.level + (rnd() - 0.55) * 6));
        changed.push('LT101', 'T1');
      }
      return { tick, changed, state: { ...state } };
    },
  };
}
