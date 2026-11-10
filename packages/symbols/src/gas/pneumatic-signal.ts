import { PIPING, port, sym } from '../shared';

/** 50 · Pneumatic signal. */
export const pneumaticSignal = /* @__PURE__ */ sym({
  type: 'gas/pneumatic-signal',
  ref: 50,
  name: 'Pneumatic signal',
  category: PIPING,
  size: [110, 18],
  ports: [port('in', 1, 9, 'left', ['pneumatic']), port('out', 109, 9, 'right', ['pneumatic'])],
  parts: [{ d: 'M1 9H109M31 17L39 1M38 17L46 1M69 17L77 1M76 17L84 1' }],
  keywords: ['signal', 'instrument air'],
});
