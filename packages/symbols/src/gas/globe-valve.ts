import { VALVES, port, sym } from '../shared';

/** 03 · Globe valve. */
export const globeValve = /* @__PURE__ */ sym({
  type: 'gas/globe-valve',
  ref: 3,
  name: 'Globe valve',
  category: VALVES,
  size: [106, 34],
  ports: [port('in', 1, 17, 'left'), port('out', 105, 17, 'right')],
  parts: [
    { d: 'M1 17H25M81 17H105M25 1L81 33V1L25 33V1Z', closable: true },
    {
      d: 'M53 24C56.87 24 60 20.87 60 17C60 13.13 56.87 10 53 10C49.13 10 46 13.13 46 17C46 20.87 49.13 24 53 24Z',
      fill: 'ink',
    },
  ],
});
