import { PIPING, port, sym } from '../shared';

/** 41 · Process line · flow direction. */
export const flowArrow = /* @__PURE__ */ sym({
  type: 'gas/flow-arrow',
  ref: 41,
  name: 'Process line · flow direction',
  category: PIPING,
  size: [110, 16],
  ports: [port('in', 1, 8, 'left', ['process']), port('out', 109, 8, 'right', ['process'])],
  parts: [{ d: 'M1 8H109' }, { d: 'M94 1L108 8L94 15V1Z', fill: 'ink' }],
  keywords: ['flow direction'],
});
