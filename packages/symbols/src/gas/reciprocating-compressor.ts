import { EQUIPMENT, port, sym } from '../shared';

/** 22 · Reciprocating compressor. */
export const reciprocatingCompressor = /* @__PURE__ */ sym({
  type: 'gas/reciprocating-compressor',
  ref: 22,
  name: 'Reciprocating compressor',
  category: EQUIPMENT,
  size: [106, 83],
  ports: [port('suction', 1, 17, 'left'), port('discharge', 105, 17, 'right')],
  parts: [{ d: 'M31 33H75M31 41H75M53 41V82M1 17H31M75 17H105M31 1H75V69H31V1Z' }],
});
