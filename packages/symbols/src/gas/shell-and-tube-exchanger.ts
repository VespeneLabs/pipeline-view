import { EQUIPMENT, port, sym } from '../shared';

/** 28 · Shell-and-tube exchanger. */
export const shellAndTubeExchanger = /* @__PURE__ */ sym({
  type: 'gas/shell-and-tube-exchanger',
  ref: 28,
  name: 'Shell-and-tube exchanger',
  category: EQUIPMENT,
  size: [130, 75],
  ports: [
    port('tube-in', 1, 37, 'left'),
    port('tube-out', 129, 37, 'right'),
    port('shell-in', 50, 1, 'top'),
    port('shell-out', 80, 74, 'bottom'),
  ],
  parts: [
    {
      d: 'M10 37C10 31.7 12.11 26.61 15.86 22.86C19.61 19.11 24.7 17 30 17H100M30 17V57M100 17C105.3 17 110.39 19.11 114.14 22.86C117.89 26.61 120 31.7 120 37M100 17V57M120 37C120 42.3 117.89 47.39 114.14 51.14C110.39 54.89 105.3 57 100 57M120 37H129M100 57H30M30 57C24.7 57 19.61 54.89 15.86 51.14C12.11 47.39 10 42.3 10 37M10 37H1M37 21V53M93 21V53M37 30H93M37 44H93M50 17V1M80 57V74',
    },
  ],
  keywords: ['heat exchanger', 'cooler', 'heater'],
});
