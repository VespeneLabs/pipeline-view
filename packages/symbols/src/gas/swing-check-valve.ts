import { VALVES, port, sym } from '../shared';

/** 06 · Swing check valve. */
export const swingCheckValve = /* @__PURE__ */ sym({
  type: 'gas/swing-check-valve',
  ref: 6,
  name: 'Swing check valve',
  category: VALVES,
  size: [106, 42],
  ports: [port('in', 1, 23, 'left'), port('out', 105, 23, 'right')],
  parts: [
    { d: 'M1 23H25V4L79 39M79 5V41M79 23H105' },
    {
      d: 'M25 7C26.66 7 28 5.66 28 4C28 2.34 26.66 1 25 1C23.34 1 22 2.34 22 4C22 5.66 23.34 7 25 7Z',
      fill: 'ink',
    },
    { d: 'M68 38L79 39L74 29' },
  ],
  keywords: ['check', 'non-return'],
});
