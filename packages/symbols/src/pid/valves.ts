import { VALVES, port, sym } from '../shared';
import { circle, valve } from './kit';

/** Four-way valve: four ports around one body. */
export const fourWayValve = /* @__PURE__ */ sym({
  type: 'pid/four-way-valve',
  name: 'Four-way valve',
  category: VALVES,
  size: [106, 98],
  ports: [
    port('a', 1, 49, 'left'),
    port('b', 105, 49, 'right'),
    port('c', 53, 1, 'top'),
    port('d', 53, 97, 'bottom'),
  ],
  parts: [
    {
      d: 'M1 49H25M81 49H105M53 1V11M53 87V97M25 33L81 65V33L25 65V33ZM37 11L53 49L69 11H37ZM37 87L53 49L69 87H37Z',
      closable: true,
    },
  ],
  keywords: ['4-way', 'diverter'],
});

/** Generic three-way valve (the gas pack has the plug version). */
export const threeWayValve = /* @__PURE__ */ sym({
  type: 'pid/three-way-valve',
  name: 'Three-way valve',
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
  ],
  keywords: ['3-way', 'diverting', 'mixing'],
});

/** Stop check valve: a check valve with a hand stem that can hold it shut. */
export const stopCheckValve = /* @__PURE__ */ sym({
  type: 'pid/stop-check-valve',
  name: 'Stop check valve',
  category: VALVES,
  size: [106, 54],
  ports: [port('in', 1, 35, 'left'), port('out', 105, 35, 'right')],
  parts: [
    { d: 'M1 35H25V16L79 51M79 17V53M79 35H105' },
    { d: circle(25, 16, 3), fill: 'ink' },
    { d: 'M68 50L79 51L74 41' },
    { d: 'M52 33V1M42 1H62' },
  ],
  keywords: ['non-return', 'NRV'],
});

export const pinchValve = /* @__PURE__ */ valve('pinch-valve', 'Pinch valve', 17, 34, [
  { d: 'M45 3L53 11L61 3M45 31L53 23L61 31' },
]);

export const knifeValve = /* @__PURE__ */ sym({
  type: 'pid/knife-valve',
  name: 'Knife gate valve',
  category: VALVES,
  size: [106, 48],
  ports: [port('in', 1, 31, 'left'), port('out', 105, 31, 'right')],
  parts: [
    { d: 'M1 31H45M61 31H105M45 15V47H61V15M53 20V1M43 1H63' },
    { d: 'M48 20H58L53 40Z', fill: 'ink' },
  ],
  keywords: ['knife', 'gate'],
});

export const slideValve = /* @__PURE__ */ sym({
  type: 'pid/slide-valve',
  name: 'Slide valve',
  category: VALVES,
  size: [106, 48],
  ports: [port('in', 1, 31, 'left'), port('out', 105, 31, 'right')],
  parts: [{ d: 'M1 31H45M61 31H105M45 15V47M61 15V47M53 1V47M43 1H63' }],
  keywords: ['slide', 'gate'],
});

export const eccentricRotaryDiscValve = /* @__PURE__ */ valve(
  'eccentric-rotary-disc-valve',
  'Eccentric rotary disc valve',
  17,
  34,
  [{ d: 'M49 8A9 9 0 0 1 49 26Z', fill: 'bg' }],
  ['rotary', 'segment', 'camflex'],
);

export const bellowsSealedValve = /* @__PURE__ */ valve(
  'bellows-sealed-valve',
  'Bellows-sealed valve',
  23,
  40,
  [{ d: 'M47 9H59V21H47Z', fill: 'bg' }],
  ['bellows', 'zero leakage'],
);

export const rotaryValve = /* @__PURE__ */ sym({
  type: 'pid/rotary-valve',
  name: 'Rotary valve',
  category: VALVES,
  size: [106, 34],
  ports: [port('in', 1, 17, 'left'), port('out', 105, 17, 'right')],
  parts: [{ d: 'M1 17H37M69 17H105M33 7V27M73 7V27' }, { d: circle(53, 17, 16), closable: true }],
  keywords: ['rotary'],
});

/** Bleeder: a small normally-closed valve on a branch off the line. */
export const bleederValve = /* @__PURE__ */ sym({
  type: 'pid/bleeder-valve',
  name: 'Bleeder valve',
  category: VALVES,
  size: [106, 50],
  ports: [port('in', 1, 49, 'left'), port('out', 105, 49, 'right'), port('vent', 53, 1, 'top')],
  parts: [{ d: 'M1 49H105M53 49V39M53 7V1' }, { d: 'M43 7H63L43 39H63L43 7Z', fill: 'ink' }],
  keywords: ['bleed', 'vent', 'drain'],
});

/** Double block and bleed: two block valves with a bleed valve between them. */
export const doubleBlockAndBleedValve = /* @__PURE__ */ sym({
  type: 'pid/double-block-and-bleed-valve',
  name: 'Double block and bleed valve',
  category: VALVES,
  size: [106, 56],
  ports: [
    port('in', 1, 17, 'left'),
    port('out', 105, 17, 'right'),
    port('bleed', 53, 55, 'bottom'),
  ],
  parts: [
    {
      d: 'M1 17H9M41 17H65M97 17H105M9 7L41 27V7L9 27V7ZM65 7L97 27V7L65 27V7Z',
      closable: true,
    },
    { d: 'M53 17V25M53 47V55' },
    { d: 'M46 25H60L46 47H60L46 25Z', fill: 'ink' },
  ],
  keywords: ['DBB', 'integrated block', 'isolation'],
});

export const angleBlowdownValve = /* @__PURE__ */ valve(
  'angle-blowdown-valve',
  'Angle blowdown valve',
  21,
  38,
  [{ d: 'M53 21L69 3M63 1L75 7' }],
  ['BDV', 'blowdown'],
);

export const excessFlowValve = /* @__PURE__ */ sym({
  type: 'pid/excess-flow-valve',
  name: 'Excess flow valve',
  category: VALVES,
  size: [106, 36],
  ports: [port('in', 1, 23, 'left'), port('out', 105, 23, 'right')],
  parts: [
    { d: 'M1 23H33M73 23H105M33 11H73V35H33V11ZM33 11L73 35M73 11L33 35M33 4H73M67 1L73 4L67 7' },
  ],
  keywords: ['EFV', 'excess flow'],
});

export const floatOperatedValve = /* @__PURE__ */ valve(
  'float-operated-valve',
  'Float-operated valve',
  39,
  56,
  [{ d: 'M53 39V9H78' }, { d: circle(86, 9, 8) }],
  ['float', 'level'],
);
