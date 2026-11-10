import { ACTUATION, port, sym } from '../shared';

/** 14 · Solenoid valve. */
export const solenoidValve = /* @__PURE__ */ sym({
  type: 'gas/solenoid-valve',
  ref: 14,
  name: 'Solenoid valve',
  category: ACTUATION,
  size: [106, 70],
  ports: [port('in', 1, 53, 'left'), port('out', 105, 53, 'right')],
  parts: [
    { d: 'M1 53H25M81 53H105M25 37L81 69V37L25 69V37Z', closable: true },
    { d: 'M53 53V24M38 1H68V24H38V1Z' },
  ],
  labels: [{ text: 'S', x: 53, y: 17.8, size: 16, weight: 600 }],
  keywords: ['SOV'],
});
