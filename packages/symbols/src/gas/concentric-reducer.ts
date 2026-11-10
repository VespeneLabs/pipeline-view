import { PIPING, port, sym } from '../shared';

/** 46 · Concentric reducer. */
export const concentricReducer = /* @__PURE__ */ sym({
  type: 'gas/concentric-reducer',
  ref: 46,
  name: 'Concentric reducer',
  category: PIPING,
  size: [110, 42],
  ports: [port('in', 1, 21, 'left'), port('out', 109, 21, 'right')],
  parts: [{ d: 'M1 21H26M84 21H109M26 1L84 11V31L26 41V1Z' }],
  keywords: ['reducer'],
});
