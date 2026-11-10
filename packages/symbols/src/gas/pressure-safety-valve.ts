import { ACTUATION, port, sym } from '../shared';

/** 18 · Pressure safety valve. */
export const pressureSafetyValve = /* @__PURE__ */ sym({
  type: 'gas/pressure-safety-valve',
  ref: 18,
  name: 'Pressure safety valve',
  category: ACTUATION,
  size: [70, 88],
  ports: [port('in', 17, 87, 'bottom'), port('out', 69, 45, 'right')],
  parts: [
    {
      d: 'M17 87V73M17 45L1 73H33L17 45ZM17 45L43 29V61L17 45ZM17 45V1M43 45H69M9 13L25 5M9 21L25 13M9 29L25 21',
    },
  ],
  keywords: ['PSV', 'relief'],
});
