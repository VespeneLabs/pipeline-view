import { VALVES, port, sym } from '../shared';

/** 05 · Butterfly valve. */
export const butterflyValve = /* @__PURE__ */ sym({
  type: 'gas/butterfly-valve',
  ref: 5,
  name: 'Butterfly valve',
  category: VALVES,
  size: [106, 42],
  ports: [port('in', 1, 21, 'left'), port('out', 105, 21, 'right')],
  parts: [{ d: 'M1 21H25M81 21H105M25 5L81 37V5L25 37V5Z', closable: true }, { d: 'M58 1L48 41' }],
});
