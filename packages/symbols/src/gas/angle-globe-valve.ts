import { VALVES, port, sym } from '../shared';

/** 10 · Angle globe valve. */
export const angleGlobeValve = /* @__PURE__ */ sym({
  type: 'gas/angle-globe-valve',
  ref: 10,
  name: 'Angle globe valve',
  category: VALVES,
  size: [70, 58],
  ports: [port('in', 17, 57, 'bottom'), port('out', 69, 17, 'right')],
  parts: [
    { d: 'M17 57V45M17 17L1 45H33L17 17ZM17 17L43 1V33L17 17ZM43 17H69', closable: true },
    {
      d: 'M17 23C20.31 23 23 20.31 23 17C23 13.69 20.31 11 17 11C13.69 11 11 13.69 11 17C11 20.31 13.69 23 17 23Z',
      fill: 'ink',
    },
  ],
});
