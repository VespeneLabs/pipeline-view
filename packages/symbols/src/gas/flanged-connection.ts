import { PIPING, port, sym } from '../shared';

/** 44 · Flanged connection. */
export const flangedConnection = /* @__PURE__ */ sym({
  type: 'gas/flanged-connection',
  ref: 44,
  name: 'Flanged connection',
  category: PIPING,
  size: [110, 44],
  ports: [port('in', 1, 22, 'left'), port('out', 109, 22, 'right')],
  parts: [{ d: 'M1 22H50M50 1V43M60 1V43M60 22H109' }],
  keywords: ['flange'],
});
