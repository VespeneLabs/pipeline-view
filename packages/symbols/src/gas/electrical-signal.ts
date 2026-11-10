import { PIPING, port, sym } from '../shared';

/** 49 · Electrical / electronic signal. */
export const electricalSignal = /* @__PURE__ */ sym({
  type: 'gas/electrical-signal',
  ref: 49,
  name: 'Electrical / electronic signal',
  category: PIPING,
  size: [110, 2],
  ports: [port('in', 1, 1, 'left', ['electrical']), port('out', 109, 1, 'right', ['electrical'])],
  parts: [{ d: 'M1 1H109', dash: '8 6' }],
  keywords: ['signal'],
});
