import type { SymbolDef } from '@pipeline-view/core';
import { ACTUATION, type Label, type Part, port, sym } from '../shared';
import { type Mark, ball, bow, fly, globe, plug, weir } from './kit';

/** An actuator drawn above a two-way body: `cy` is where the body sits, `d` includes the stem. */
interface Actuator {
  cy: number;
  d: string;
  /** Letter inside the actuator box. */
  label?: string;
}

const HAND: Actuator = { cy: 35, d: 'M53 35V1M37 1H69' };
const DIAPHRAGM: Actuator = { cy: 41, d: 'M53 41V16M36 16A17 15 0 0 1 70 16Z' };
const BOX = 'M53 53V24M38 1H68V24H38V1Z';
const MOTOR: Actuator = { cy: 53, d: BOX, label: 'M' };
const HYDRAULIC: Actuator = { cy: 53, d: BOX, label: 'H' };
const BALANCED: Actuator = {
  cy: 41,
  d: 'M53 41V19M36 10A17 9 0 1 0 70 10A17 9 0 1 0 36 10ZM36 10H70',
};
const QUARTER_TURN: Actuator = { cy: 41, d: 'M53 41V17M31 1H75V17H31V1Z' };
const TOP_HANDWHEEL: Actuator = { cy: 49, d: 'M53 49V1M45 1H61M36 24A17 15 0 0 1 70 24Z' };
const ELECTRO_HYDRAULIC: Actuator = {
  cy: 47,
  d: 'M53 47V25M61.5 4.5L44.5 21.5M41 13A12 12 0 1 0 65 13A12 12 0 1 0 41 13Z',
};
const BELLOWS: Actuator = {
  cy: 53,
  d: 'M53 53V23M41 1H65V23H41V1ZM53 3L47 6L59 10L47 14L59 18L53 21',
};
const TALL_DIAPHRAGM: Actuator = { cy: 53, d: 'M53 53V16M36 16A17 15 0 0 1 70 16Z' };
const RESET_SOLENOID: Actuator = { cy: 61, d: 'M53 61V24M38 1H68V24H38V1Z', label: 'S' };

interface Extra {
  parts?: Part[];
  labels?: Label[];
  keywords?: string[];
  /** Extra height below the body, for marks that stick out of it. */
  pad?: number;
}

/* @__NO_SIDE_EFFECTS__ */
function small(text: string, x: number, y: number, size = 10): Label {
  return { text, x, y, size, weight: 600 };
}

/** A two-way body with an actuator on top. */
/* @__NO_SIDE_EFFECTS__ */
function actuated(
  id: string,
  name: string,
  a: Actuator,
  mark: Mark | null,
  x: Extra = {},
): SymbolDef {
  return sym({
    type: `pid/${id}`,
    name,
    category: ACTUATION,
    size: [106, a.cy + 17 + (x.pad ?? 0)],
    ports: [port('in', 1, a.cy, 'left'), port('out', 105, a.cy, 'right')],
    parts: [
      { d: bow(a.cy), closable: true },
      ...(mark ? mark(a.cy) : []),
      { d: a.d },
      ...(x.parts ?? []),
    ],
    labels: [...(a.label ? [small(a.label, 53, 17.8, 16)] : []), ...(x.labels ?? [])],
    keywords: x.keywords ?? [],
  });
}

// Body and actuator combinations.

export const handOperatedGlobeValve = /* @__PURE__ */ actuated(
  'hand-operated-globe-valve',
  'Hand-operated globe valve',
  HAND,
  globe,
  { keywords: ['manual', 'handwheel'] },
);

export const motorOperatedGateValve = /* @__PURE__ */ actuated(
  'motor-operated-gate-valve',
  'Motor-operated gate valve',
  MOTOR,
  null,
  { keywords: ['MOV', 'electric'] },
);

export const motorOperatedGlobeValve = /* @__PURE__ */ actuated(
  'motor-operated-globe-valve',
  'Motor-operated globe valve',
  MOTOR,
  globe,
  { keywords: ['MOV', 'electric'] },
);

export const motorOperatedPlugValve = /* @__PURE__ */ actuated(
  'motor-operated-plug-valve',
  'Motor-operated plug valve',
  MOTOR,
  plug,
  { keywords: ['MOV', 'electric'] },
);

export const motorOperatedDiaphragmValve = /* @__PURE__ */ actuated(
  'motor-operated-diaphragm-valve',
  'Motor-operated diaphragm valve',
  MOTOR,
  weir,
  { keywords: ['MOV', 'electric'] },
);

export const pneumaticGateValve = /* @__PURE__ */ actuated(
  'pneumatic-gate-valve',
  'Pneumatic gate valve',
  DIAPHRAGM,
  null,
  { keywords: ['POV', 'diaphragm actuator'] },
);

export const pneumaticButterflyValve = /* @__PURE__ */ actuated(
  'pneumatic-butterfly-valve',
  'Pneumatic butterfly valve',
  DIAPHRAGM,
  fly,
  { pad: 4, keywords: ['POV', 'diaphragm actuator'] },
);

export const hydraulicGateValve = /* @__PURE__ */ actuated(
  'hydraulic-gate-valve',
  'Hydraulic gate valve',
  HYDRAULIC,
  null,
  { keywords: ['HMV', 'hydraulic'] },
);

export const hydraulicGlobeValve = /* @__PURE__ */ actuated(
  'hydraulic-globe-valve',
  'Hydraulic globe valve',
  HYDRAULIC,
  globe,
  { keywords: ['HMV', 'hydraulic'] },
);

export const hydraulicBallValve = /* @__PURE__ */ actuated(
  'hydraulic-ball-valve',
  'Hydraulic ball valve',
  HYDRAULIC,
  ball,
  { keywords: ['HMV', 'hydraulic'] },
);

export const balancedDiaphragmGateValve = /* @__PURE__ */ actuated(
  'balanced-diaphragm-gate-valve',
  'Balanced-diaphragm gate valve',
  BALANCED,
  null,
  { keywords: ['pressure balanced'] },
);

export const quarterTurnValveDoubleActing = /* @__PURE__ */ actuated(
  'quarter-turn-valve-double-acting',
  'Quarter-turn valve · double acting',
  QUARTER_TURN,
  ball,
  { keywords: ['quarter turn', 'rack and pinion', 'scotch yoke'] },
);

export const quarterTurnValveSpringReturn = /* @__PURE__ */ actuated(
  'quarter-turn-valve-spring-return',
  'Quarter-turn valve · spring return',
  QUARTER_TURN,
  ball,
  {
    parts: [{ d: 'M53 1V17M55 9L58 4L62 14L66 4L70 14L73 9' }],
    keywords: ['quarter turn', 'spring acting', 'single acting'],
  },
);

export const failOpenValve = /* @__PURE__ */ actuated(
  'fail-open-valve',
  'Pneumatic valve · fail open',
  DIAPHRAGM,
  null,
  { parts: [{ d: 'M57 24L53 19L49 24' }], keywords: ['FO', 'fail open', 'air to close'] },
);

// Actuator details.

export const valveWithPositioner = /* @__PURE__ */ actuated(
  'valve-with-positioner',
  'Control valve with positioner',
  DIAPHRAGM,
  null,
  { parts: [{ d: 'M53 21H61V33H53' }], keywords: ['positioner', 'POS'] },
);

export const valveWithSideHandwheel = /* @__PURE__ */ actuated(
  'valve-with-side-handwheel',
  'Control valve with side handwheel',
  DIAPHRAGM,
  null,
  { parts: [{ d: 'M53 27H62M62 21V33' }], keywords: ['handwheel', 'manual override'] },
);

export const valveWithTopHandwheel = /* @__PURE__ */ actuated(
  'valve-with-top-handwheel',
  'Control valve with top handwheel',
  TOP_HANDWHEEL,
  null,
  { keywords: ['handwheel', 'manual override'] },
);

export const electroHydraulicValve = /* @__PURE__ */ actuated(
  'electro-hydraulic-valve',
  'Electro-hydraulic valve',
  ELECTRO_HYDRAULIC,
  null,
  { labels: [small('E', 48.5, 12.5, 9), small('H', 57.5, 20.5, 9)], keywords: ['E/H', 'EHV'] },
);

export const bellowsActuatedValve = /* @__PURE__ */ actuated(
  'bellows-actuated-valve',
  'Bellows-actuated valve',
  BELLOWS,
  null,
  { keywords: ['bellows', 'spring opposed'] },
);

export const partialStrokeTestValveManual = /* @__PURE__ */ actuated(
  'partial-stroke-test-valve-manual',
  'Valve with partial stroke test · manual',
  TALL_DIAPHRAGM,
  null,
  {
    parts: [{ d: 'M43 24H63V36H43Z', fill: 'bg' }, { d: 'M63 30H71M71 27H77V33H71Z' }],
    keywords: ['PST', 'partial stroke'],
  },
);

export const partialStrokeTestValveRemote = /* @__PURE__ */ actuated(
  'partial-stroke-test-valve-remote',
  'Valve with partial stroke test · remote',
  TALL_DIAPHRAGM,
  null,
  {
    parts: [{ d: 'M43 24H63V36H43Z', fill: 'bg' }, { d: 'M63 30H69M69 23H83V37H69Z' }],
    labels: [small('S', 76, 33.5)],
    keywords: ['PST', 'partial stroke'],
  },
);

export const solenoidValveManualReset = /* @__PURE__ */ actuated(
  'solenoid-valve-manual-reset',
  'Solenoid valve · manual reset',
  RESET_SOLENOID,
  null,
  {
    parts: [{ d: 'M53 34H63M63 34L73 24L83 34L73 44Z' }],
    labels: [small('R', 73, 37.5)],
    keywords: ['latching', 'reset', 'SOV'],
  },
);

export const solenoidValveManualRemoteReset = /* @__PURE__ */ actuated(
  'solenoid-valve-manual-remote-reset',
  'Solenoid valve · manual and remote reset',
  RESET_SOLENOID,
  null,
  {
    parts: [{ d: 'M43 34H63M63 34L73 24L83 34L73 44ZM43 34L33 24L23 34L33 44Z' }],
    labels: [small('R', 73, 37.5), small('R', 33, 37.5)],
    keywords: ['latching', 'reset', 'SOV'],
  },
);

export const threeWaySolenoidValve = /* @__PURE__ */ sym({
  type: 'pid/three-way-solenoid-valve',
  name: 'Three-way solenoid valve',
  category: ACTUATION,
  size: [106, 102],
  ports: [
    port('in', 1, 53, 'left'),
    port('out', 105, 53, 'right'),
    port('branch', 53, 101, 'bottom'),
  ],
  parts: [
    {
      d: 'M1 53H25M81 53H105M53 91V101M25 37L81 69V37L25 69V37ZM37 91L53 53L69 91H37Z',
      closable: true,
    },
    { d: BOX },
  ],
  labels: [small('S', 53, 17.8, 16)],
  keywords: ['3-way', 'SOV'],
});

export const fourWaySolenoidValve = /* @__PURE__ */ sym({
  type: 'pid/four-way-solenoid-valve',
  name: 'Four-way solenoid valve',
  category: ACTUATION,
  size: [106, 110],
  ports: [
    port('a', 1, 61, 'left'),
    port('b', 105, 61, 'right'),
    port('c', 53, 1, 'top'),
    port('d', 53, 109, 'bottom'),
  ],
  parts: [
    {
      d: 'M1 61H25M81 61H105M53 1V23M53 99V109M25 45L81 77V45L25 77V45ZM37 23L53 61L69 23H37ZM37 99L53 61L69 99H37Z',
      closable: true,
    },
    { d: 'M20 21L53 61M1 1H25V21H1V1Z' },
  ],
  labels: [small('S', 13, 16, 14)],
  keywords: ['4-way', 'SOV'],
});

export const fivePortSolenoidValve = /* @__PURE__ */ sym({
  type: 'pid/five-port-solenoid-valve',
  name: 'Four-way five-port solenoid valve',
  category: ACTUATION,
  size: [106, 94],
  ports: [
    port('a', 1, 53, 'left'),
    port('b', 105, 53, 'right'),
    port('supply', 53, 1, 'top'),
    port('c', 32, 93, 'bottom'),
    port('d', 74, 93, 'bottom'),
  ],
  parts: [
    {
      d: 'M1 53H11M95 53H105M53 41V1M32 83V93M74 83V93M11 41L53 65V41L11 65V41ZM53 41L95 65V41L53 65V41ZM20 83L32 53L44 83H20ZM62 83L74 53L86 83H62Z',
      closable: true,
    },
    { d: 'M32 53V24M17 1H47V24H17V1Z' },
  ],
  labels: [small('S', 32, 17.8, 16)],
  keywords: ['5/2', '5-port', 'SOV'],
});

/** Pilot-operated relief valve, with the pilot sensing line tapped off the inlet. */
export const pilotOperatedReliefValve = /* @__PURE__ */ sym({
  type: 'pid/pilot-operated-relief-valve',
  name: 'Pilot-operated relief valve',
  category: ACTUATION,
  size: [80, 88],
  ports: [port('in', 27, 87, 'bottom'), port('out', 79, 45, 'right')],
  parts: [
    {
      d: 'M27 87V73M27 45L11 73H43L27 45ZM27 45L53 29V61L27 45ZM53 45H79M27 45V23M17 3H37V23H17V3Z',
    },
    { d: 'M17 13H3V80H27', dash: '3 3' },
  ],
  labels: [small('P', 27, 18, 14)],
  keywords: ['PORV', 'POSRV', 'PSV', 'PRV', 'pilot'],
});
