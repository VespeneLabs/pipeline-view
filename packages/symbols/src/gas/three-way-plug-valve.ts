import { VALVES, port, sym } from '../shared';

/** 09 · Three-way plug valve. */
export const threeWayPlugValve = /* @__PURE__ */ sym({
  type: 'gas/three-way-plug-valve',
  ref: 9,
  name: 'Three-way plug valve',
  category: VALVES,
  size: [106, 66],
  ports: [
    port('in', 1, 17, 'left'),
    port('out', 105, 17, 'right'),
    port('branch', 53, 65, 'bottom'),
  ],
  parts: [
    {
      d: 'M1 17H25M81 17H105M53 55V65M25 1L81 33V1L25 33V1ZM37 55L53 17L69 55H37Z',
      closable: true,
    },
    { d: 'M46 10H60L57 24H49L46 10Z', fill: 'bg' },
  ],
  keywords: ['3-way', 'diverting'],
});
