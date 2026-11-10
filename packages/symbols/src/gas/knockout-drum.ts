import { EQUIPMENT, port, sym } from '../shared';

/** 26 · Knockout drum. */
export const knockoutDrum = /* @__PURE__ */ sym({
  type: 'gas/knockout-drum',
  ref: 26,
  name: 'Knockout drum',
  category: EQUIPMENT,
  size: [106, 92],
  ports: [
    port('in', 1, 47, 'left'),
    port('out', 105, 47, 'right'),
    port('drain', 53, 91, 'bottom'),
  ],
  parts: [
    {
      d: 'M74 72V9C60 1 46 1 32 9V72C46 80.67 60 80.67 74 72ZM32 9C46 17 60 17 74 9M74 72C60 64 46 64 32 72M1 47H32M74 47H105M53 79V91M74 22H32L40 30L48 22L56 30L64 22L72 30M32 30H74',
    },
  ],
  keywords: ['KO drum', 'mist eliminator'],
});
