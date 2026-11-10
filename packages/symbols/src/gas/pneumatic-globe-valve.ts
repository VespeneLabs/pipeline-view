import { ACTUATION, port, sym } from '../shared';

/** 12 · Pneumatic globe valve. */
export const pneumaticGlobeValve = /* @__PURE__ */ sym({
  type: 'gas/pneumatic-globe-valve',
  ref: 12,
  name: 'Pneumatic globe valve',
  category: ACTUATION,
  size: [106, 58],
  ports: [port('in', 1, 41, 'left'), port('out', 105, 41, 'right')],
  parts: [
    { d: 'M1 41H25M81 41H105M25 25L81 57V25L25 57V25Z', closable: true },
    {
      d: 'M53 48C56.87 48 60 44.87 60 41C60 37.13 56.87 34 53 34C49.13 34 46 37.13 46 41C46 44.87 49.13 48 53 48Z',
      fill: 'ink',
    },
    {
      d: 'M53 41V16M36 16C36 12.02 37.79 8.21 40.98 5.39C44.17 2.58 48.49 1 53 1C57.51 1 61.83 2.58 65.02 5.39C68.21 8.21 70 12.02 70 16H36Z',
    },
  ],
  keywords: ['control valve', 'diaphragm actuator'],
});
