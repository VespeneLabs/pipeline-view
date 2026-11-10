import { ACTUATION, port, sym } from '../shared';

/** 11 · Hand-operated gate valve. */
export const handOperatedGateValve = /* @__PURE__ */ sym({
  type: 'gas/hand-operated-gate-valve',
  ref: 11,
  name: 'Hand-operated gate valve',
  category: ACTUATION,
  size: [106, 52],
  ports: [port('in', 1, 35, 'left'), port('out', 105, 35, 'right')],
  parts: [
    { d: 'M1 35H25M81 35H105M25 19L81 51V19L25 51V19Z', closable: true },
    { d: 'M53 35V1M37 1H69' },
  ],
  keywords: ['manual', 'handwheel'],
});
