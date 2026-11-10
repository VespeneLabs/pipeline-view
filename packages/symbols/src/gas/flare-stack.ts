import { EQUIPMENT, port, sym } from '../shared';

/** 30 · Flare stack. */
export const flareStack = /* @__PURE__ */ sym({
  type: 'gas/flare-stack',
  ref: 30,
  name: 'Flare stack',
  category: EQUIPMENT,
  size: [64, 92],
  ports: [port('in', 1, 81, 'bottom')],
  parts: [
    { d: 'M29 90V31H47V90M14 91H63M29 66H1V81M32 25C21 13 36 10 38 1C40 10 55 18 43 26L32 25Z' },
  ],
  keywords: ['flare'],
});
