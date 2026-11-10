import { ACTUATION, port, sym } from '../shared';

/** 19 · Rupture disc. */
export const ruptureDisc = /* @__PURE__ */ sym({
  type: 'gas/rupture-disc',
  ref: 19,
  name: 'Rupture disc',
  category: ACTUATION,
  size: [106, 42],
  ports: [port('in', 1, 21, 'left'), port('out', 105, 21, 'right')],
  parts: [{ d: 'M1 21H43M43 1V41M47 1C65.67 14.33 65.67 27.67 47 41M65 21H105' }],
  keywords: ['bursting disc'],
});
