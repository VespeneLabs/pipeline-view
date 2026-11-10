import type { SymbolDef } from '@pipeline-view/core';
import { PROCESS, group, part, port } from '../shared';
import type { TankData } from './tank';

const SHELL = /* @__PURE__ */ part({
  d: 'M22 26C40.67 14 59.33 14 78 26V84L50 114L22 84V26Z',
});
const NOZZLES = /* @__PURE__ */ part({
  d: 'M22 26C40.67 38 59.33 38 78 26M8 60H22M78 60H92M50 114V126',
});
const svg = /* @__PURE__ */ group(SHELL + NOZZLES);

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Liquid outline at `level` (0..1): a band in the cylinder plus the cone, or only part of the cone. */
function levelPath(level: number): string {
  const y = r2(114 - level * (114 - 26));
  if (y < 84) return `M22 ${y}H78V84L50 114L22 84Z`;
  const half = r2((28 * (114 - y)) / 30);
  return `M${r2(50 - half)} ${y}H${r2(50 + half)}L50 114Z`;
}

/** Cone-bottom tank / vessel with a bindable fill level (Figma "Symbol / Conical vessel"). */
export const conicalTank: SymbolDef = {
  type: 'process/conical-tank',
  name: 'Cone-bottom tank',
  category: PROCESS,
  size: { width: 100, height: 128 },
  ports: [
    port('in', 8, 60, 'left'),
    port('out', 92, 60, 'right'),
    port('top', 50, 17, 'top'),
    port('bottom', 50, 126, 'bottom'),
  ],
  svg,
  render: (ctx) => {
    const level = Number((ctx.data as TankData).level);
    if (!Number.isFinite(level) || level <= 0) return svg;
    const fill =
      `<path d="${levelPath(Math.min(level, 1))}" stroke="none" ` +
      'style="fill:var(--pv-level-fill,currentColor);fill-opacity:var(--pv-level-opacity,0.18)"/>';
    return group(fill + SHELL + NOZZLES);
  },
  keywords: ['vessel', 'tank', 'cone', 'hopper', 'level'],
};
