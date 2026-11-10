import type { DataRecord, SymbolDef } from '@pipeline-view/core';
import { PROCESS, group, part, port } from '../shared';

/** Data bound by the tank: fill level from 0 (empty) to 1 (full). */
export interface TankData extends DataRecord {
  level?: number;
}

const SHELL = /* @__PURE__ */ part({
  d: 'M22 26C40.67 14 59.33 14 78 26V100C59.33 112 40.67 112 22 100V26Z',
});
const NOZZLES = /* @__PURE__ */ part({
  d: 'M22 26C40.67 38 59.33 38 78 26M8 60H22M78 60H92M50 110V124',
});
const svg = /* @__PURE__ */ group(SHELL + NOZZLES);

function levelPath(level: number): string {
  const y = Math.round((100 - level * (100 - 26)) * 100) / 100;
  return (
    `<path d="M22 ${y}H78V100C59.33 112 40.67 112 22 100Z" stroke="none" ` +
    'style="fill:var(--pv-level-fill,currentColor);fill-opacity:var(--pv-level-opacity,0.18)"/>'
  );
}

/** Tank / vessel with a bindable fill level (Figma "Symbol / Vessel", process diagram 1:21). */
export const tank: SymbolDef = {
  type: 'process/tank',
  name: 'Tank',
  category: PROCESS,
  size: { width: 100, height: 128 },
  ports: [
    port('in', 8, 60, 'left'),
    port('out', 92, 60, 'right'),
    port('top', 50, 17, 'top'),
    port('bottom', 50, 124, 'bottom'),
  ],
  svg,
  render: (ctx) => {
    const level = Number((ctx.data as TankData).level);
    if (!Number.isFinite(level) || level <= 0) return svg;
    return group(levelPath(Math.min(level, 1)) + SHELL + NOZZLES);
  },
  keywords: ['vessel', 'tank', 'level'],
};
