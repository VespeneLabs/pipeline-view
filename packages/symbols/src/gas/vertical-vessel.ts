import { EQUIPMENT, port, sym } from '../shared';

/** 24 · Vertical vessel. */
export const verticalVessel = /* @__PURE__ */ sym({
  type: 'gas/vertical-vessel',
  ref: 24,
  name: 'Vertical vessel',
  category: EQUIPMENT,
  size: [63, 82],
  ports: [
    port('in', 1, 34.12, 'left'),
    port('out', 61.48, 34.12, 'right'),
    port('drain', 31.24, 80.2, 'bottom'),
  ],
  parts: [
    { d: 'M11.08 9.64C24.52 1 37.96 1 51.4 9.64V62.92C37.96 71.56 24.52 71.56 11.08 62.92V9.64Z' },
    {
      d: 'M11.08 9.64C24.52 18.28 37.96 18.28 51.4 9.64M1 34.12H11.08M51.4 34.12H61.48M31.24 70.12V80.2',
    },
  ],
  keywords: ['separator', 'scrubber'],
});
