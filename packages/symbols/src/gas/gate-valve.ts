import { VALVES, port, sym } from '../shared';

/** 01 · Gate valve. */
export const gateValve = /* @__PURE__ */ sym({
  type: 'gas/gate-valve',
  ref: 1,
  name: 'Gate valve',
  category: VALVES,
  size: [106, 34],
  ports: [port('in', 1, 17, 'left'), port('out', 105, 17, 'right')],
  parts: [{ d: 'M1 17H25M81 17H105M25 1L81 33V1L25 33V1Z', closable: true }],
});
