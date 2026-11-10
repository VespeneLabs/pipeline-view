import type { SymbolDef } from '@pipeline-view/core';
import { PROCESS, group, part } from '../shared';

/** Consumer / burner: the end user of a line, a box with a flame mark and one inlet. */
export const burner: SymbolDef = {
  type: 'process/burner',
  name: 'Consumer / burner',
  category: PROCESS,
  size: { width: 64, height: 56 },
  ports: [{ id: 'in', position: { x: 0, y: 40 }, direction: 'left', role: 'in' }],
  svg: /* @__PURE__ */ group(
    part({ d: 'M12 2H62V54H12Z', fill: 'bg' }) +
      part({ d: 'M0 40H12' }) +
      part({
        d: 'M37 46C30 46 26 40 29 33C31 36 34 37 35 34C35 28 38 23 42 18C42 26 49 30 49 37C49 42 44 46 37 46Z',
      }),
  ),
  keywords: ['burner', 'consumer', 'appliance', 'heater', 'furnace', 'boiler', 'end user', 'gas'],
};
