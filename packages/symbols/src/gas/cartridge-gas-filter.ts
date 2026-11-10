import { EQUIPMENT, port, sym } from '../shared';

/** 27 · Cartridge gas filter. */
export const cartridgeGasFilter = /* @__PURE__ */ sym({
  type: 'gas/cartridge-gas-filter',
  ref: 27,
  name: 'Cartridge gas filter',
  category: EQUIPMENT,
  size: [106, 82],
  ports: [port('in', 1, 36, 'left'), port('out', 105, 36, 'right')],
  parts: [
    { d: 'M1 36H32M74 36H105M32 1H74V81H32V1Z' },
    { d: 'M32 16H74M32 56L53 74L74 56M43 27V50H63V27', dash: '3 4' },
  ],
  keywords: ['filter separator'],
});
