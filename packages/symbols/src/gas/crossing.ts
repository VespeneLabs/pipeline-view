import { PIPING, port, sym } from '../shared';

/** 43 · Crossing · no connection. */
export const crossing = /* @__PURE__ */ sym({
  type: 'gas/crossing',
  ref: 43,
  name: 'Crossing · no connection',
  category: PIPING,
  size: [110, 78],
  ports: [
    port('west', 1, 39, 'left'),
    port('east', 109, 39, 'right'),
    port('north', 55, 1, 'top'),
    port('south', 55, 77, 'bottom'),
  ],
  parts: [
    {
      d: 'M1 39H45C45 36.35 46.05 33.8 47.93 31.93C49.8 30.05 52.35 29 55 29C57.65 29 60.2 30.05 62.07 31.93C63.95 33.8 65 36.35 65 39H109M55 1V77',
    },
  ],
  keywords: ['jump', 'hop'],
});
