import { ACTUATION, port, sym } from '../shared';

/** 13 · Motor-operated ball valve. */
export const motorOperatedBallValve = /* @__PURE__ */ sym({
  type: 'gas/motor-operated-ball-valve',
  ref: 13,
  name: 'Motor-operated ball valve',
  category: ACTUATION,
  size: [106, 70],
  ports: [port('in', 1, 53, 'left'), port('out', 105, 53, 'right')],
  parts: [
    { d: 'M1 53H25M81 53H105M25 37L81 69V37L25 69V37Z', closable: true },
    {
      d: 'M53 62C57.97 62 62 57.97 62 53C62 48.03 57.97 44 53 44C48.03 44 44 48.03 44 53C44 57.97 48.03 62 53 62Z',
      fill: 'bg',
    },
    { d: 'M53 53V24M38 1H68V24H38V1Z' },
  ],
  labels: [{ text: 'M', x: 53, y: 17.8, size: 16, weight: 600 }],
  keywords: ['MOV', 'electric actuator'],
});
