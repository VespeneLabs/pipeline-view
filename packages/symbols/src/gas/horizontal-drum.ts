import { EQUIPMENT, port, sym } from '../shared';

const SHELL =
  'M111 25C111 31.37 108.47 37.47 103.97 41.97C99.47 46.47 93.37 49 87 49H27C20.63 49 14.53 46.47 10.03 41.97C5.53 37.47 3 31.37 3 25C3 18.63 5.53 12.53 10.03 8.03C14.53 3.53 20.63 1 27 1H87C93.37 1 99.47 3.53 103.97 8.03C108.47 12.53 111 18.63 111 25Z';

/** 25 · Horizontal drum. `data.level` fills it. */
export const horizontalDrum = /* @__PURE__ */ sym({
  type: 'gas/horizontal-drum',
  ref: 25,
  name: 'Horizontal drum',
  category: EQUIPMENT,
  size: [120, 50],
  ports: [port('in', 1, 25, 'left'), port('out', 119, 25, 'right')],
  parts: [
    {
      d: SHELL + 'M27 1V49M87 1V49M111 25H119M3 25H1',
    },
  ],
  level: [{ d: SHELL, top: 1, bottom: 49 }],
  keywords: ['accumulator', 'slug catcher'],
});
