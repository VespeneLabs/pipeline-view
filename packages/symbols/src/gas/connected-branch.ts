import { PIPING, port, sym } from '../shared';

/** 42 · Connected branch. */
export const connectedBranch = /* @__PURE__ */ sym({
  type: 'gas/connected-branch',
  ref: 42,
  name: 'Connected branch',
  category: PIPING,
  size: [110, 44],
  ports: [port('a', 1, 39, 'left'), port('b', 109, 39, 'right'), port('branch', 55, 1, 'top')],
  parts: [
    { d: 'M1 39H109M55 1V39' },
    {
      d: 'M55 43C57.21 43 59 41.21 59 39C59 36.79 57.21 35 55 35C52.79 35 51 36.79 51 39C51 41.21 52.79 43 55 43Z',
      fill: 'ink',
    },
  ],
  keywords: ['tee', 'junction'],
});
