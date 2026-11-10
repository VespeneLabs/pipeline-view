import { VALVES, port, sym } from '../shared';

/** 02 · Ball valve. */
export const ballValve = /* @__PURE__ */ sym({
  type: 'gas/ball-valve',
  ref: 2,
  name: 'Ball valve',
  category: VALVES,
  size: [106, 34],
  ports: [port('in', 1, 17, 'left'), port('out', 105, 17, 'right')],
  parts: [
    { d: 'M1 17H25M81 17H105M25 1L81 33V1L25 33V1Z', closable: true },
    {
      d: 'M53 26C57.97 26 62 21.97 62 17C62 12.03 57.97 8 53 8C48.03 8 44 12.03 44 17C44 21.97 48.03 26 53 26Z',
      fill: 'bg',
    },
  ],
});
