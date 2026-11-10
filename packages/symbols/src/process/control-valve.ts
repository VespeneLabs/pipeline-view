import type { SymbolDef } from '@pipeline-view/core';
import { PROCESS, SIGNAL_KINDS, type ValveData, group, part, port } from '../shared';

const BODY = /* @__PURE__ */ part({
  d: 'M3 45H17L63 65V25L17 65V25L63 45H77',
});
const ACTUATOR = /* @__PURE__ */ part({
  d: 'M40 45V17M25 17C35 5.67 45 5.67 55 17H25Z',
});
const svg = /* @__PURE__ */ group(BODY + ACTUATOR);
const closed = /* @__PURE__ */ group(
  part({ d: 'M17 25L63 65V25L17 65Z', fill: 'ink' }) + BODY + ACTUATOR,
);

/** Control valve with diaphragm actuator and a bindable open/closed state (Figma "Symbol / Control valve"). */
export const controlValve: SymbolDef = {
  type: 'process/control-valve',
  name: 'Control valve',
  category: PROCESS,
  size: { width: 80, height: 80 },
  ports: [
    port('in', 3, 45, 'left'),
    port('out', 77, 45, 'right'),
    port('actuator', 40, 8.5, 'top', SIGNAL_KINDS),
  ],
  svg,
  render: (ctx) => ((ctx.data as ValveData).open === false ? closed : svg),
  keywords: ['FCV', 'control valve', 'globe'],
};
