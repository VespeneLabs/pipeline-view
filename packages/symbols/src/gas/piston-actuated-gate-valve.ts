import { ACTUATION, port, sym } from '../shared';

/** 15 · Piston-actuated gate valve. */
export const pistonActuatedGateValve = /* @__PURE__ */ sym({
  type: 'gas/piston-actuated-gate-valve',
  ref: 15,
  name: 'Piston-actuated gate valve',
  category: ACTUATION,
  size: [106, 70],
  ports: [port('in', 1, 53, 'left'), port('out', 105, 53, 'right')],
  parts: [
    { d: 'M1 53H25M81 53H105M25 37L81 69V37L25 69V37Z', closable: true },
    { d: 'M53 53V27M43 1V27M63 1V27M43 13H63M35 1H71V27H35V1Z' },
  ],
  keywords: ['cylinder'],
});
