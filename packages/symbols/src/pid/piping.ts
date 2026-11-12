import type { SymbolDef } from '@pipeline-view/core';
import { PIPING, type Part, port, sym } from '../shared';
import { circle, inline } from './kit';

/* @__NO_SIDE_EFFECTS__ */
function fitting(
  id: string,
  name: string,
  size: [number, number],
  cy: number,
  parts: Part[],
  keywords: string[] = [],
  letter?: string,
): SymbolDef {
  return inline(id, name, PIPING, size, cy, parts, {
    keywords,
    labels: letter ? [{ text: letter, x: size[0] / 2, y: 29.4, size: 23 }] : [],
  });
}

// Piping specials.

export const spectacleBlind = /* @__PURE__ */ fitting(
  'spectacle-blind',
  'Spectacle blind',
  [110, 42],
  33,
  [{ d: 'M1 33H109' }, { d: circle(55, 33, 8), fill: 'bg' }, { d: circle(55, 17, 8), fill: 'ink' }],
  ['figure 8', 'line blind', 'isolation'],
);

export const blindDisc = /* @__PURE__ */ fitting(
  'blind-disc',
  'Blind disc (spade)',
  [110, 42],
  31,
  [{ d: 'M1 31H109M55 41V13' }, { d: circle(55, 7, 6), fill: 'ink' }],
  ['spade', 'paddle blind', 'line blind', 'isolation'],
);

export const openDisc = /* @__PURE__ */ fitting(
  'open-disc',
  'Open disc (spacer)',
  [110, 42],
  31,
  [{ d: 'M1 31H109M55 41V13' }, { d: circle(55, 7, 6) }],
  ['spacer', 'ring spacer', 'paddle spacer'],
);

export const endCap = /* @__PURE__ */ sym({
  type: 'pid/end-cap',
  name: 'End cap',
  category: PIPING,
  size: [56, 34],
  ports: [port('in', 1, 17, 'left')],
  parts: [{ d: 'M1 17H40M40 3V31M40 3A14 14 0 0 1 40 31' }],
  keywords: ['cap', 'closure'],
});

export const pipeUnion = /* @__PURE__ */ fitting(
  'union',
  'Union',
  [110, 34],
  17,
  [{ d: 'M1 17H49M61 17H109M49 5V29M61 5V29M49 9H61M49 25H61' }],
  ['coupling'],
);

export const expansionJoint = /* @__PURE__ */ fitting(
  'expansion-joint',
  'Expansion joint',
  [110, 34],
  17,
  [
    {
      d: 'M1 17H35M75 17H109M35 3V31M75 3V31M35 7A5 5 0 0 1 45 7A5 5 0 0 1 55 7A5 5 0 0 1 65 7A5 5 0 0 1 75 7M35 27A5 5 0 0 0 45 27A5 5 0 0 0 55 27A5 5 0 0 0 65 27A5 5 0 0 0 75 27',
    },
  ],
  ['bellows', 'compensator'],
);

export const flexibleHose = /* @__PURE__ */ fitting(
  'flexible-hose',
  'Flexible hose',
  [110, 26],
  13,
  [
    {
      d: 'M1 13H21M89 13H109M21 5V21M89 5V21M21 13C27 1 33 1 38 13C43 25 49 25 55 13C61 1 67 1 72 13C77 25 83 25 89 13',
    },
  ],
  ['hose'],
);

export const removableSpool = /* @__PURE__ */ fitting(
  'removable-spool',
  'Removable spool',
  [110, 34],
  17,
  [{ d: 'M1 17H37M73 17H109M37 5V29M41 5V29M69 5V29M73 5V29M41 17H69' }],
  ['spool piece'],
);

export const insulatingJoint = /* @__PURE__ */ fitting(
  'insulating-joint',
  'Insulating joint',
  [110, 34],
  17,
  [{ d: 'M1 17H49M61 17H109M49 3V31M61 3V31' }, { d: 'M53 3H57V31H53Z', fill: 'ink' }],
  ['IJ', 'isolation joint', 'monolithic joint', 'electrically insulated', 'cathodic protection'],
);

export const eccentricReducer = /* @__PURE__ */ sym({
  type: 'pid/eccentric-reducer',
  name: 'Eccentric reducer',
  category: PIPING,
  size: [110, 42],
  ports: [port('in', 1, 21, 'left'), port('out', 109, 31, 'right')],
  parts: [{ d: 'M1 21H26M84 31H109M26 1L84 21V41H26V1Z' }],
  keywords: ['reducer'],
});

export const atmosphericVent = /* @__PURE__ */ sym({
  type: 'pid/vent',
  name: 'Vent to atmosphere',
  category: PIPING,
  size: [26, 42],
  ports: [port('in', 13, 41, 'bottom')],
  parts: [{ d: 'M13 41V2M5 12L13 2L21 12' }],
  keywords: ['open vent', 'atmosphere'],
});

export const funnelDrain = /* @__PURE__ */ sym({
  type: 'pid/drain',
  name: 'Drain to funnel',
  category: PIPING,
  size: [30, 42],
  ports: [port('in', 15, 1, 'top')],
  parts: [{ d: 'M15 1V17M9 11L15 17L21 11M3 23L11 35H19L27 23M15 35V41' }],
  keywords: ['tundish', 'open drain'],
});

export const breather = /* @__PURE__ */ sym({
  type: 'pid/breather',
  name: 'Breather',
  category: PIPING,
  size: [34, 42],
  ports: [port('in', 17, 41, 'bottom')],
  parts: [
    {
      d: 'M17 17V41M3 3H31V17H3V3ZM7 6L13 14M13 6L7 14M14 6L20 14M20 6L14 14M21 6L27 14M27 6L21 14',
    },
  ],
  keywords: ['breather valve', 'vent cap'],
});

const TRAP = 'M1 21H35M75 21H109M35 1H75V41H35V1Z';

export const steamTrap = /* @__PURE__ */ fitting(
  'steam-trap',
  'Steam trap',
  [110, 42],
  21,
  [{ d: TRAP }],
  ['condensate trap'],
  'T',
);

export const ejector = /* @__PURE__ */ sym({
  type: 'pid/ejector',
  name: 'Ejector / eductor',
  category: PIPING,
  size: [110, 42],
  ports: [
    port('motive', 1, 21, 'left'),
    port('suction', 33, 1, 'top'),
    port('discharge', 109, 21, 'right'),
  ],
  parts: [{ d: 'M1 21H25M89 21H109M33 9V1M25 9H41V33H25V9ZM41 13L89 5V37L41 29' }],
  keywords: ['eductor', 'jet pump', 'injector'],
});

/** Instrument valve manifold: two block valves and an equalizing valve. */
export const valveManifold = /* @__PURE__ */ sym({
  type: 'pid/valve-manifold',
  name: 'Valve manifold',
  category: PIPING,
  size: [106, 50],
  ports: [
    port('process-high', 35, 49, 'bottom'),
    port('process-low', 71, 49, 'bottom'),
    port('instrument-high', 35, 1, 'top'),
    port('instrument-low', 71, 1, 'top'),
  ],
  parts: [
    { d: 'M1 1H105V49H1Z', dash: '4 4' },
    {
      d: 'M35 1V15M35 35V49M71 1V15M71 35V49M35 25H45M61 25H71M29 15H41L29 35H41L29 15ZM65 15H77L65 35H77L65 15ZM45 20L61 30V20L45 30V20Z',
    },
  ],
  keywords: ['3-valve manifold', 'instrument manifold', 'equalizing'],
});

// Strainers, silencers and arrestors.

export const basketStrainer = /* @__PURE__ */ fitting(
  'basket-strainer',
  'Basket strainer',
  [110, 46],
  17,
  [
    { d: 'M1 17H41M69 17H109M37 7H73M41 7V31A14 14 0 0 0 69 31V7' },
    { d: 'M47 17V31A8 8 0 0 0 63 31V17', dash: '3 3' },
  ],
  ['strainer', 'filter'],
);

export const duplexStrainer = /* @__PURE__ */ fitting(
  'duplex-strainer',
  'Duplex strainer',
  [110, 50],
  25,
  [{ d: 'M1 25H109M37 17V33M73 17V33' }, { d: circle(55, 13, 11) }, { d: circle(55, 37, 11) }],
  ['strainer', 'twin strainer'],
);

export const coneStrainer = /* @__PURE__ */ fitting(
  'cone-strainer',
  'Cone strainer',
  [110, 34],
  17,
  [{ d: 'M1 17H109M43 3V31' }, { d: 'M43 5L71 17L43 29', dash: '3 3' }],
  ['temporary strainer', 'witch hat', 'start-up strainer'],
);

export const ventSilencer = /* @__PURE__ */ sym({
  type: 'pid/vent-silencer',
  name: 'Vent silencer',
  category: PIPING,
  size: [46, 70],
  ports: [port('in', 23, 69, 'bottom')],
  parts: [{ d: 'M23 57V69M11 13H35V57H11V13ZM11 13L17 3H29L35 13' }],
  labels: [{ text: 'S', x: 23, y: 41, size: 16 }],
  keywords: ['silencer', 'blowdown silencer'],
});

// The same body as the gas pack's flame arrester, with another letter.
const ARRESTER = 'M1 21H21M85 10H93V32H85M93 21H113M21 10H29V32H21V10ZM29 1H85V41H29V1Z';

export const inlineSilencer = /* @__PURE__ */ fitting(
  'inline-silencer',
  'In-line silencer',
  [114, 42],
  21,
  [{ d: ARRESTER }],
  ['silencer', 'muffler'],
  'S',
);

export const exhaustSilencer = /* @__PURE__ */ fitting(
  'exhaust-silencer',
  'Exhaust silencer',
  [110, 42],
  21,
  [{ d: 'M1 21H35M75 21H109M35 3H75V39H35V3ZM48 3V27M62 15V39' }],
  ['silencer', 'muffler'],
);

export const pulsationDampener = /* @__PURE__ */ sym({
  type: 'pid/pulsation-dampener',
  name: 'Pulsation dampener',
  category: PIPING,
  size: [42, 60],
  ports: [port('in', 21, 59, 'bottom')],
  parts: [{ d: 'M21 47V59M11 11A10 10 0 0 1 31 11V37A10 10 0 0 1 11 37ZM11 24H31' }],
  keywords: ['PD', 'dampener', 'accumulator', 'pulsation bottle'],
});

export const detonationArrestor = /* @__PURE__ */ fitting(
  'detonation-arrestor',
  'Detonation arrestor',
  [114, 42],
  21,
  [{ d: ARRESTER }],
  ['detonation arrester', 'flame arrester'],
  'D',
);

// End connections. The gas pack has the flanged one.

export const threadedConnection = /* @__PURE__ */ fitting(
  'threaded-connection',
  'Threaded connection',
  [110, 26],
  13,
  [{ d: 'M1 13H109M55 3V23' }],
  ['screwed', 'NPT'],
);

export const weldedConnection = /* @__PURE__ */ fitting(
  'welded-connection',
  'Welded connection',
  [110, 26],
  13,
  [{ d: 'M1 13H109' }, { d: 'M49 7H61V19H49Z', fill: 'ink' }],
  ['butt weld', 'BW'],
);

export const socketWeldConnection = /* @__PURE__ */ fitting(
  'socket-weld-connection',
  'Socket weld connection',
  [110, 26],
  13,
  [{ d: 'M1 13H109' }, { d: 'M49 7H61V19H49Z', fill: 'bg' }],
  ['SW'],
);

// Line and signal types. The gas pack has the electrical and pneumatic signals.

/* @__NO_SIDE_EFFECTS__ */
function line(
  id: string,
  name: string,
  height: number,
  cy: number,
  parts: Part[],
  kind: string | undefined,
  keywords: string[],
): SymbolDef {
  return inline(id, name, PIPING, [110, height], cy, parts, {
    keywords,
    ...(kind && { accepts: [kind] }),
  });
}

const WAVES = 'M25 11C29 1 35 1 39 11C43 21 49 21 53 11M61 11C65 1 71 1 75 11C79 21 85 21 89 11';
const BEADS = 'M33 6A4 4 0 1 0 41 6A4 4 0 1 0 33 6ZM69 6A4 4 0 1 0 77 6A4 4 0 1 0 69 6Z';

export const hydraulicSignal = /* @__PURE__ */ line(
  'hydraulic-signal',
  'Hydraulic signal',
  18,
  9,
  [{ d: 'M1 9H109M35 1V15H45M71 1V15H81' }],
  'hydraulic',
  ['signal'],
);

export const capillaryTube = /* @__PURE__ */ line(
  'capillary-tube',
  'Capillary tube',
  18,
  9,
  [{ d: 'M1 9H109M31 3L43 15M43 3L31 15M67 3L79 15M79 3L67 15' }],
  'capillary',
  ['filled system', 'sensing line'],
);

export const guidedSignal = /* @__PURE__ */ line(
  'guided-signal',
  'Electromagnetic or sonic signal · guided',
  22,
  11,
  [{ d: 'M1 11H109' }, { d: WAVES }],
  'signal',
  ['fiber optic', 'sonic'],
);

export const unguidedSignal = /* @__PURE__ */ line(
  'unguided-signal',
  'Electromagnetic or sonic signal · not guided',
  22,
  11,
  [{ d: WAVES }],
  'signal',
  ['wireless', 'radio'],
);

export const dataLink = /* @__PURE__ */ line(
  'data-link',
  'Data link · shared system',
  12,
  6,
  [{ d: 'M1 6H109' }, { d: BEADS, fill: 'bg' }],
  'signal',
  ['software link', 'system bus', 'DCS', 'PLC'],
);

export const dataLinkBetweenSystems = /* @__PURE__ */ line(
  'data-link-between-systems',
  'Data link · between systems',
  12,
  6,
  [{ d: 'M1 6H109' }, { d: BEADS, fill: 'ink' }],
  'signal',
  ['software link', 'fieldbus', 'communication link'],
);

export const mechanicalLink = /* @__PURE__ */ line(
  'mechanical-link',
  'Mechanical link',
  12,
  6,
  [
    { d: 'M1 6H109' },
    { d: circle(37, 6, 5), fill: 'bg' },
    { d: circle(73, 6, 5), fill: 'bg' },
    { d: circle(37, 6, 2), fill: 'ink' },
    { d: circle(73, 6, 2), fill: 'ink' },
  ],
  'mechanical',
  ['linkage'],
);

export const undefinedSignal = /* @__PURE__ */ line(
  'undefined-signal',
  'Undefined signal',
  18,
  9,
  [{ d: 'M1 9H109M34 17L42 1M70 17L78 1' }],
  'signal',
  ['signal'],
);

/** Drawn at half the weight of a process line. */
export const minorProcessLine: SymbolDef = {
  type: 'pid/minor-process-line',
  name: 'Minor process line',
  category: PIPING,
  size: { width: 110, height: 2 },
  ports: [port('in', 1, 1, 'left'), port('out', 109, 1, 'right')],
  svg: '<g fill="none" stroke="currentColor" stroke-width="1"><path d="M1 1H109"/></g>',
  keywords: ['connection to process', 'secondary line'],
};

export const heatTracedLine = /* @__PURE__ */ line(
  'heat-traced-line',
  'Heat-traced line',
  12,
  3,
  [{ d: 'M1 3H109' }, { d: 'M1 9H109', dash: '6 4' }],
  undefined,
  ['tracing', 'steam traced', 'electric traced'],
);

export const batteryLimit = /* @__PURE__ */ line(
  'battery-limit',
  'Battery limit',
  2,
  1,
  [{ d: 'M1 1H109', dash: '14 4 2 4' }],
  undefined,
  ['boundary', 'scope limit'],
);
