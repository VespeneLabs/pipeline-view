import type { DataRecord, SymbolDef } from '@pipeline-view/core';
import { PROCESS, group, part, port } from '../shared';

/** Data bound by the pump: `running: true` draws the impeller filled. */
export interface PumpData extends DataRecord {
  running?: boolean;
}

const CASING = /* @__PURE__ */ part({
  d: 'M40 60C52.71 60 63 49.71 63 37C63 24.29 52.71 14 40 14C27.29 14 17 24.29 17 37C17 49.71 27.29 60 40 60Z',
});
const NOZZLES = /* @__PURE__ */ part({
  d: 'M0 37H17M40 14V3H80M22 63H58M29 57V63M51 57V63',
});
const IMPELLER = 'M16.38 19.5L44.46 28.86L16.38 38.22';
const svg = /* @__PURE__ */ group(CASING + part({ d: IMPELLER }) + NOZZLES);
const running = /* @__PURE__ */ group(CASING + part({ d: IMPELLER + 'Z', fill: 'ink' }) + NOZZLES);

/** Centrifugal pump with a bindable running state (Figma "Symbol / Centrifugal pump"). */
export const pump: SymbolDef = {
  type: 'process/pump',
  name: 'Centrifugal pump',
  category: PROCESS,
  size: { width: 80, height: 80 },
  ports: [port('suction', 0, 37, 'left'), port('discharge', 80, 3, 'right')],
  svg,
  render: (ctx) => ((ctx.data as PumpData).running === true ? running : svg),
  keywords: ['pump', 'centrifugal'],
};
