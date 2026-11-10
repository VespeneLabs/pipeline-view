import { EQUIPMENT, port, sym } from '../shared';

/** 21 · Centrifugal compressor. */
export const centrifugalCompressor = /* @__PURE__ */ sym({
  type: 'gas/centrifugal-compressor',
  ref: 21,
  name: 'Centrifugal compressor',
  category: EQUIPMENT,
  size: [106, 64],
  ports: [port('suction', 1, 32, 'left'), port('discharge', 105, 32, 'right')],
  parts: [
    {
      d: 'M53 63C70.12 63 84 49.12 84 32C84 14.88 70.12 1 53 1C35.88 1 22 14.88 22 32C22 49.12 35.88 63 53 63Z',
    },
    { d: 'M1 32H22M84 32H105M28 13L78 22V42L28 51V13Z' },
  ],
});
