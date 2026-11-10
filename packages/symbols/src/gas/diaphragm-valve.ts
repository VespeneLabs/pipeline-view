import { VALVES, port, sym } from '../shared';

/** 08 · Diaphragm valve. */
export const diaphragmValve = /* @__PURE__ */ sym({
  type: 'gas/diaphragm-valve',
  ref: 8,
  name: 'Diaphragm valve',
  category: VALVES,
  size: [106, 39],
  ports: [port('in', 1, 22, 'left'), port('out', 105, 22, 'right')],
  parts: [
    { d: 'M1 22H25M81 22H105M25 6L81 38V6L25 38V6Z', closable: true },
    { d: 'M40 15C48.67 1 57.33 1 66 15' },
  ],
});
