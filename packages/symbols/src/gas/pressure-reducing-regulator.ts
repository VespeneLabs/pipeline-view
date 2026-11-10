import { ACTUATION, port, sym } from '../shared';

/** 16 · Pressure-reducing regulator. */
export const pressureReducingRegulator = /* @__PURE__ */ sym({
  type: 'gas/pressure-reducing-regulator',
  ref: 16,
  name: 'Pressure-reducing regulator',
  category: ACTUATION,
  size: [106, 58],
  ports: [port('in', 1, 41, 'left'), port('out', 105, 41, 'right')],
  parts: [
    { d: 'M1 41H25M81 41H105M25 25L81 57V25L25 57V25Z', closable: true },
    {
      d: 'M53 41V16M36 16C36 12.02 37.79 8.21 40.98 5.39C44.17 2.58 48.49 1 53 1C57.51 1 61.83 2.58 65.02 5.39C68.21 8.21 70 12.02 70 16H36Z',
    },
    { d: 'M53 1H97V41' },
  ],
  keywords: ['PRV', 'regulator', 'PCV'],
});
