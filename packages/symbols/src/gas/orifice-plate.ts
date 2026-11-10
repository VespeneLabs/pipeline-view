import { PIPING, port, sym } from '../shared';

/** 45 · Orifice plate. */
export const orificePlate = /* @__PURE__ */ sym({
  type: 'gas/orifice-plate',
  ref: 45,
  name: 'Orifice plate',
  category: PIPING,
  size: [110, 56],
  ports: [port('in', 1, 28, 'left'), port('out', 109, 28, 'right')],
  parts: [{ d: 'M1 28H44M44 8V48M55 1V55M66 8V48M66 28H109' }],
  keywords: ['FE', 'flow element', 'metering'],
});
