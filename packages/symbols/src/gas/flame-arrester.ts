import { PIPING, port, sym } from '../shared';

/** 48 · Flame arrester. */
export const flameArrester = /* @__PURE__ */ sym({
  type: 'gas/flame-arrester',
  ref: 48,
  name: 'Flame arrester',
  category: PIPING,
  size: [114, 42],
  ports: [port('in', 1, 21, 'left'), port('out', 113, 21, 'right')],
  parts: [{ d: 'M1 21H21M85 10H93V32H85M93 21H113M21 10H29V32H21V10ZM29 1H85V41H29V1Z' }],
  labels: [{ text: 'F', x: 57, y: 29.4, size: 23, weight: 500 }],
  keywords: ['arrestor'],
});
