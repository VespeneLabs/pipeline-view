import { EQUIPMENT, port, sym } from '../shared';

/** 23 · Screw compressor. */
export const screwCompressor = /* @__PURE__ */ sym({
  type: 'gas/screw-compressor',
  ref: 23,
  name: 'Screw compressor',
  category: EQUIPMENT,
  size: [106, 64],
  ports: [port('suction', 1, 32, 'left'), port('discharge', 105, 32, 'right')],
  parts: [
    {
      d: 'M53 63C70.12 63 84 49.12 84 32C84 14.88 70.12 1 53 1C35.88 1 22 14.88 22 32C22 49.12 35.88 63 53 63Z',
    },
    {
      d: 'M1 32H22M84 32H105M33 28L39 22L46 28L53 22L60 28L67 22L74 28M33 38L39 32L46 38L53 32L60 38L67 32L74 38',
    },
  ],
});
