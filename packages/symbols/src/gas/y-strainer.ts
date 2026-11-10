import { PIPING, port, sym } from '../shared';

/** 47 · Y-strainer. */
export const yStrainer = /* @__PURE__ */ sym({
  type: 'gas/y-strainer',
  ref: 47,
  name: 'Y-strainer',
  category: PIPING,
  size: [92, 53],
  ports: [port('in', 1, 15, 'left'), port('out', 91, 15, 'right')],
  parts: [
    { d: 'M1 15H91M16 1V29M79 1V29M35 15L67 47M53 15L82 41M66 48L82 32M63 52L85 30' },
    { d: 'M44 15L73 44', dash: '3 3' },
  ],
  keywords: ['strainer'],
});
