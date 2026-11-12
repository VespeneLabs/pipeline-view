import type { SymbolDef } from '@pipeline-view/core';
import { INSTRUMENTATION, type Part, instrument, port, sym } from '../shared';
import { circle, inline } from './kit';

// Flow and metering elements. Each sits in the line, 110 px wide.

const BOX = 'M1 21H35M75 21H109M35 5H75V37H35V5Z';
const TALL_BOX = 'M1 21H35M75 21H109M35 1H75V41H35V1Z';

/* @__NO_SIDE_EFFECTS__ */
function meter(id: string, name: string, parts: Part[], keywords: string[]): SymbolDef {
  return inline(id, name, INSTRUMENTATION, [110, 42], 21, parts, { keywords });
}

export const turbineMeter = /* @__PURE__ */ meter(
  'turbine-meter',
  'Turbine meter',
  [{ d: BOX }, { d: 'M43 21H67M55 9C62 15 62 27 55 33C48 27 48 15 55 9Z' }],
  ['flow meter', 'FE', 'custody transfer'],
);

export const ultrasonicMeter = /* @__PURE__ */ meter(
  'ultrasonic-meter',
  'Ultrasonic meter',
  [{ d: BOX }, { d: 'M45 13A12 12 0 0 1 45 29M51 10A16 16 0 0 1 51 32M57 7A20 20 0 0 1 57 35' }],
  ['flow meter', 'FE', 'USM', 'custody transfer'],
);

export const coriolisMeter = /* @__PURE__ */ inline(
  'coriolis-meter',
  'Coriolis meter',
  INSTRUMENTATION,
  [110, 42],
  9,
  [{ d: 'M1 9H49M61 9H109M43 9V29A12 12 0 0 0 67 29V9M49 9V29A6 6 0 0 0 61 29V9' }],
  { keywords: ['flow meter', 'FE', 'mass flow'] },
);

export const vortexMeter = /* @__PURE__ */ meter(
  'vortex-meter',
  'Vortex meter',
  [{ d: BOX }, { d: 'M43 14V28L51 21ZM54 17C58 13 62 21 66 17M54 25C58 21 62 29 66 25' }],
  ['flow meter', 'FE', 'vortex shedding'],
);

export const venturiMeter = /* @__PURE__ */ meter(
  'venturi-meter',
  'Venturi tube',
  [{ d: 'M1 21H23M87 21H109M23 5L45 15H55L87 5V37L55 27H45L23 37V5Z' }],
  ['flow meter', 'FE', 'venturi'],
);

export const flowNozzle = /* @__PURE__ */ meter(
  'flow-nozzle',
  'Flow nozzle',
  [{ d: 'M1 21H109M51 3V39M59 3V39M59 9C67 11 71 15 73 18M59 33C67 31 71 27 73 24' }],
  ['flow meter', 'FE', 'nozzle'],
);

export const vConeMeter = /* @__PURE__ */ meter(
  'v-cone-meter',
  'V-cone meter',
  [{ d: 'M1 21H27M83 21H109M27 5H83V37H27V5Z' }, { d: 'M41 21L65 11V31L41 21Z' }],
  ['flow meter', 'FE', 'cone'],
);

export const pitotTube = /* @__PURE__ */ inline(
  'pitot-tube',
  'Pitot tube',
  INSTRUMENTATION,
  [110, 34],
  27,
  [{ d: 'M1 27H109M59 1V21H45' }],
  { more: [port('tap', 59, 1, 'top')], keywords: ['flow meter', 'FE', 'pitot'] },
);

export const averagingPitotTube = /* @__PURE__ */ inline(
  'averaging-pitot-tube',
  'Averaging pitot tube',
  INSTRUMENTATION,
  [110, 42],
  21,
  [{ d: 'M1 21H109M55 1V41M50 9H55M50 15H55M50 27H55M50 33H55' }],
  { more: [port('tap', 55, 1, 'top')], keywords: ['flow meter', 'FE', 'annubar'] },
);

export const rotaryMeter = /* @__PURE__ */ meter(
  'rotary-meter',
  'Rotary meter',
  [{ d: TALL_BOX }, { d: circle(55, 12, 8) }, { d: circle(55, 30, 8) }],
  ['flow meter', 'FE', 'positive displacement', 'roots meter'],
);

export const diaphragmMeter = /* @__PURE__ */ meter(
  'diaphragm-meter',
  'Diaphragm meter',
  [{ d: TALL_BOX }, { d: 'M55 1V5C45 13 65 29 55 37V41' }],
  ['flow meter', 'FE', 'gas meter', 'bellows meter'],
);

/** Rotameter: a tapered tube with a float. Flow runs bottom to top. */
export const rotameter = /* @__PURE__ */ sym({
  type: 'pid/rotameter',
  name: 'Rotameter',
  category: INSTRUMENTATION,
  size: [36, 58],
  ports: [port('in', 18, 57, 'bottom'), port('out', 18, 1, 'top')],
  parts: [{ d: 'M18 1V9M18 49V57M7 9H29L24 49H12L7 9Z' }, { d: circle(18, 26, 3), fill: 'ink' }],
  keywords: ['flow meter', 'FI', 'variable area'],
});

export const straighteningVanes = /* @__PURE__ */ meter(
  'straightening-vanes',
  'Straightening vanes',
  [{ d: 'M1 21H31M79 21H109M31 7H79V35H31V7ZM31 14H79M31 21H79M31 28H79' }],
  ['flow conditioner', 'flow straightener'],
);

// Other field devices.

export const levelGauge = /* @__PURE__ */ sym({
  type: 'pid/level-gauge',
  name: 'Level gauge',
  category: INSTRUMENTATION,
  size: [28, 72],
  ports: [port('top', 1, 15, 'left'), port('bottom', 1, 57, 'left')],
  parts: [{ d: 'M1 15H15M1 57H15M15 9H27V63H15V9ZM21 15V57' }],
  keywords: ['LG', 'gauge glass', 'level glass'],
});

export const sightGlass = /* @__PURE__ */ inline(
  'sight-glass',
  'Sight glass',
  INSTRUMENTATION,
  [110, 34],
  17,
  [{ d: 'M1 17H35M75 17H109M35 3H75V31H35V3Z' }, { d: circle(55, 17, 10) }],
  { keywords: ['FG', 'viewing glass', 'flow sight glass'] },
);

export const thermowell = /* @__PURE__ */ inline(
  'thermowell',
  'Thermowell',
  INSTRUMENTATION,
  [110, 34],
  21,
  [{ d: 'M1 21H51M59 21H109M47 1H63M51 1V27A4 4 0 0 0 59 27V1' }],
  { more: [port('tap', 55, 1, 'top')], keywords: ['TW', 'temperature well'] },
);

export const sampleConnection = /* @__PURE__ */ inline(
  'sample-connection',
  'Sample connection',
  INSTRUMENTATION,
  [110, 44],
  9,
  [{ d: 'M1 9H109M55 9V21M49 21H61V25L65 31V43H45V31L49 25V21Z' }],
  { keywords: ['SC', 'sampler', 'sample point'] },
);

export const corrosionCoupon = /* @__PURE__ */ inline(
  'corrosion-coupon',
  'Corrosion coupon',
  INSTRUMENTATION,
  [110, 40],
  27,
  [{ d: 'M1 27H109M55 1V17M49 1H61' }, { d: 'M52 17H58V37H52Z', fill: 'ink' }],
  { keywords: ['COR', 'corrosion probe'] },
);

// Instrument bubbles by location and device (ISA-5.1). The gas pack has the field and main-panel
// bubbles. Each one is a preset of the same drawing: `device` and `location` in a node's data redraw it.

export const behindPanelInstrument = /* @__PURE__ */ instrument({
  type: 'pid/behind-panel-instrument',
  name: 'Instrument · behind main panel',
  letters: 'TI',
  location: 'behind-panel',
  keywords: ['rear of panel', 'not accessible'],
});

export const localPanelInstrument = /* @__PURE__ */ instrument({
  type: 'pid/local-panel-instrument',
  name: 'Instrument · local panel',
  letters: 'PIC',
  location: 'local-panel',
  keywords: ['secondary panel', 'local control panel'],
});

export const behindLocalPanelInstrument = /* @__PURE__ */ instrument({
  type: 'pid/behind-local-panel-instrument',
  name: 'Instrument · behind local panel',
  letters: 'PI',
  location: 'behind-local-panel',
  keywords: ['field cabinet', 'not accessible'],
});

export const sharedDisplayInstrument = /* @__PURE__ */ instrument({
  type: 'pid/shared-display-instrument',
  name: 'Shared display / control',
  letters: 'FIC',
  device: 'shared',
  location: 'panel',
  keywords: ['DCS', 'shared control', 'console'],
});

export const computerFunction = /* @__PURE__ */ instrument({
  type: 'pid/computer-function',
  name: 'Computer function',
  letters: 'FY',
  device: 'computer',
  location: 'panel',
  keywords: ['computer', 'calculation'],
});

export const plcFunction = /* @__PURE__ */ instrument({
  type: 'pid/plc-function',
  name: 'Programmable logic control',
  letters: 'YIC',
  device: 'plc',
  location: 'panel',
  keywords: ['PLC', 'logic', 'interlock'],
});
