import type { SymbolDef } from '@pipeline-view/core';
import { PIPING, group, part } from '../shared';

/**
 * Point-of-use outlet: the end of a line where the medium is taken off, drawn as a socket (a ring
 * with a filled centre) on a short stub. One inlet.
 */
export const outletPoint: SymbolDef = {
  type: 'process/outlet-point',
  name: 'Point-of-use outlet',
  category: PIPING,
  size: { width: 38, height: 24 },
  ports: [{ id: 'in', position: { x: 0, y: 12 }, direction: 'left', role: 'in' }],
  svg: /* @__PURE__ */ group(
    part({ d: 'M0 12H14' }) +
      part({ d: 'M14 12A11 11 0 1 0 36 12A11 11 0 1 0 14 12Z', fill: 'bg' }) +
      part({ d: 'M22 12A3 3 0 1 0 28 12A3 3 0 1 0 22 12Z', fill: 'ink' }),
  ),
  keywords: [
    'outlet',
    'point of use',
    'tapping point',
    'take-off',
    'outlet station',
    'terminal unit',
    'socket',
    'quick connector',
    'consumer',
  ],
};
