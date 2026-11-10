import { ACTUATION, port, sym } from '../shared';

/** 20 · Shutdown valve · fail closed. */
export const shutdownValve = /* @__PURE__ */ sym({
  type: 'gas/shutdown-valve',
  ref: 20,
  name: 'Shutdown valve · fail closed',
  category: ACTUATION,
  size: [106, 58],
  ports: [port('in', 1, 41, 'left'), port('out', 105, 41, 'right')],
  parts: [
    { d: 'M1 41H25M81 41H105M25 25L81 57V25L25 57V25Z', closable: true },
    {
      d: 'M53 50C57.97 50 62 45.97 62 41C62 36.03 57.97 32 53 32C48.03 32 44 36.03 44 41C44 45.97 48.03 50 53 50Z',
      fill: 'bg',
    },
    {
      d: 'M53 41V16M36 16C36 12.02 37.79 8.21 40.98 5.39C44.17 2.58 48.49 1 53 1C57.51 1 61.83 2.58 65.02 5.39C68.21 8.21 70 12.02 70 16H36Z',
    },
    { d: 'M53 18V31M57 26L53 31L49 26' },
  ],
  keywords: ['SDV', 'ESD', 'fail closed'],
});
