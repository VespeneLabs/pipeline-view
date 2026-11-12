import type { SymbolDef } from '@pipeline-view/core';
import { PROCESS, type Part, port, sym } from '../shared';
import { circle, inline } from './kit';

// Pumps. The process pack has the centrifugal pump with a running state.

const CASING = 'M14 32A27 27 0 1 0 68 32A27 27 0 1 0 14 32Z';
const NOZZLES = 'M1 32H14M68 32H81';

/** ISO-style pump: a circle with the pump type drawn inside and a mark on the discharge side. */
/* @__NO_SIDE_EFFECTS__ */
function pumpOf(id: string, name: string, glyph: Part[], keywords: string[]): SymbolDef {
  return sym({
    type: `pid/${id}`,
    name,
    category: PROCESS,
    size: [82, 64],
    ports: [port('suction', 1, 32, 'left'), port('discharge', 81, 32, 'right')],
    parts: [{ d: NOZZLES }, { d: CASING }, ...glyph],
    keywords: ['pump', ...keywords],
  });
}

const MARK: Part = { d: 'M60 26L68 32L60 38Z', fill: 'ink' };

export const genericPump = /* @__PURE__ */ pumpOf(
  'pump',
  'Pump',
  [{ d: 'M41 5L68 32L41 59' }],
  ['ISO'],
);

export const positiveDisplacementPump = /* @__PURE__ */ pumpOf(
  'positive-displacement-pump',
  'Positive-displacement pump',
  [MARK, { d: 'M31 22H51V42H31Z' }],
  ['PD', 'metering'],
);

export const progressiveCavityPump = /* @__PURE__ */ pumpOf(
  'progressive-cavity-pump',
  'Progressive cavity pump',
  [MARK, { d: 'M22 32C27 22 32 22 37 32C42 42 47 42 52 32' }],
  ['mono pump', 'eccentric screw'],
);

export const screwPump = /* @__PURE__ */ pumpOf(
  'screw-pump',
  'Screw pump',
  [MARK, { d: 'M22 32L27 24L35 40L43 24L51 40L55 32' }],
  ['screw'],
);

export const gearPump = /* @__PURE__ */ pumpOf(
  'gear-pump',
  'Gear pump',
  [MARK, { d: circle(38, 23, 8) }, { d: circle(38, 41, 8) }],
  ['gear', 'lube oil'],
);

export const diaphragmPump = /* @__PURE__ */ pumpOf(
  'diaphragm-pump',
  'Diaphragm pump',
  [MARK, { d: 'M30 18V46M30 18C46 26 46 38 30 46' }],
  ['dosing', 'chemical injection', 'metering'],
);

export const reciprocatingPump = /* @__PURE__ */ pumpOf(
  'reciprocating-pump',
  'Reciprocating pump',
  [MARK, { d: 'M22 32H42M42 22V42' }],
  ['piston', 'plunger'],
);

export const vacuumPump = /* @__PURE__ */ pumpOf(
  'vacuum-pump',
  'Vacuum pump',
  [MARK, { d: 'M22 18L56 27M22 46L56 37' }],
  ['vacuum'],
);

export const verticalInlinePump = /* @__PURE__ */ sym({
  type: 'pid/vertical-inline-pump',
  name: 'Vertical in-line pump',
  category: PROCESS,
  size: [82, 58],
  ports: [port('suction', 1, 45, 'left'), port('discharge', 81, 45, 'right')],
  parts: [{ d: 'M1 45H29M53 45H81M41 25V33M31 1H51V25H31V1Z' }, { d: circle(41, 45, 12) }],
  keywords: ['pump', 'vertical', 'in-line'],
});

export const sumpPump = /* @__PURE__ */ sym({
  type: 'pid/sump-pump',
  name: 'Sump pump',
  category: PROCESS,
  size: [62, 82],
  ports: [port('suction', 31, 81, 'bottom'), port('discharge', 51, 1, 'top')],
  parts: [
    { d: 'M21 1H41V21H21V1ZM11 29H61M31 21V57M31 77V81M41 67H51V1' },
    { d: circle(31, 67, 10) },
  ],
  keywords: ['pump', 'sump', 'drain pump', 'submersible'],
});

export const verticalCanPump = /* @__PURE__ */ sym({
  type: 'pid/vertical-can-pump',
  name: 'Vertical can pump',
  category: PROCESS,
  size: [62, 84],
  ports: [port('suction', 1, 35, 'left'), port('discharge', 61, 35, 'right')],
  parts: [{ d: 'M21 1H41V21H21V1ZM31 21V29M1 35H21M41 35H61M21 29H41V73A10 10 0 0 1 21 73V29Z' }],
  keywords: ['pump', 'can', 'barrel pump', 'vertical turbine'],
});

// Storage.

const SHELL = 'M11 21V71H71V21M1 31H11M71 63H81';
const OPEN_SHELL = 'M11 7V71H71V7M1 31H11M71 63H81';

/* @__NO_SIDE_EFFECTS__ */
function tankOf(id: string, name: string, paths: string[], keywords: string[]): SymbolDef {
  return sym({
    type: `pid/${id}`,
    name,
    category: PROCESS,
    size: [82, 72],
    ports: [port('in', 1, 31, 'left'), port('out', 81, 63, 'right')],
    parts: paths.map((d) => ({ d })),
    keywords: ['tank', 'storage', ...keywords],
  });
}

const DOME = 'M11 21C25 5 57 5 71 21';
const CONE = 'M11 21L41 7L71 21';

export const domeRoofTank = /* @__PURE__ */ tankOf(
  'dome-roof-tank',
  'Dome roof tank',
  [SHELL, DOME],
  ['fixed roof'],
);

export const coneRoofTank = /* @__PURE__ */ tankOf(
  'cone-roof-tank',
  'Cone roof tank',
  [SHELL, CONE],
  ['fixed roof'],
);

export const openTopTank = /* @__PURE__ */ tankOf(
  'open-top-tank',
  'Open top tank',
  [OPEN_SHELL],
  ['open tank', 'pit'],
);

export const internalFloatingRoofTank = /* @__PURE__ */ tankOf(
  'internal-floating-roof-tank',
  'Internal floating roof tank',
  [SHELL, CONE, 'M11 39H71M11 35H17V39M71 35H65V39'],
  ['IFR', 'floating roof'],
);

export const externalFloatingRoofTank = /* @__PURE__ */ tankOf(
  'external-floating-roof-tank',
  'External floating roof tank',
  [OPEN_SHELL, 'M11 29H19V23H63V29H71'],
  ['EFR', 'floating roof'],
);

export const doubleWallTank = /* @__PURE__ */ tankOf(
  'double-wall-tank',
  'Double wall tank',
  [SHELL, DOME, 'M17 27H65V65H17V27Z'],
  ['full containment', 'LNG', 'cryogenic'],
);

export const sphere = /* @__PURE__ */ sym({
  type: 'pid/sphere',
  name: 'Storage sphere',
  category: PROCESS,
  size: [82, 72],
  ports: [port('in', 41, 1, 'top'), port('out', 41, 71, 'bottom')],
  parts: [{ d: circle(41, 32, 31) }, { d: 'M23 57V71M59 57V71M17 71H65M41 63V71' }],
  keywords: ['tank', 'storage', 'Horton sphere', 'LPG'],
});

export const spheroidTank = /* @__PURE__ */ sym({
  type: 'pid/spheroid-tank',
  name: 'Spheroid (onion) tank',
  category: PROCESS,
  size: [82, 72],
  ports: [port('in', 41, 1, 'top'), port('out', 81, 37, 'right')],
  parts: [
    { d: 'M6 37A35 24 0 1 0 76 37A35 24 0 1 0 6 37Z' },
    { d: 'M41 13V1M76 37H81M17 54.5V71M65 54.5V71M11 71H71' },
  ],
  keywords: ['tank', 'storage', 'onion tank', 'spheroid'],
});

export const storageBin = /* @__PURE__ */ sym({
  type: 'pid/bin',
  name: 'Bin',
  category: PROCESS,
  size: [82, 72],
  ports: [port('in', 41, 1, 'top'), port('out', 41, 71, 'bottom')],
  parts: [{ d: 'M11 1H71V41L41 71L11 41V1Z' }],
  keywords: ['hopper', 'silo', 'storage'],
});

export const gasCylinder = /* @__PURE__ */ sym({
  type: 'pid/gas-cylinder',
  name: 'Gas cylinder',
  category: PROCESS,
  size: [38, 62],
  ports: [port('out', 19, 1, 'top')],
  parts: [{ d: 'M9 23C9 15 13 13 15 11V5H23V11C25 13 29 15 29 23V61H9V23ZM19 5V1' }],
  keywords: ['gas bottle', 'cylinder', 'calibration gas', 'nitrogen'],
});

// Cooling towers. Warm water enters on the right; the basin outlet is below it.

const BASIN = 'M17 71H89V79H17V71ZM89 75H105';

/* @__NO_SIDE_EFFECTS__ */
function tower(
  id: string,
  name: string,
  inletY: number,
  outline: string[],
  fill: string,
  keywords: string[],
): SymbolDef {
  return sym({
    type: `pid/${id}`,
    name,
    category: PROCESS,
    size: [106, 80],
    ports: [port('in', 105, inletY, 'right'), port('out', 105, 75, 'right')],
    parts: [...outline.map((d) => ({ d })), { d: fill, dash: '3 3' }],
    keywords: ['cooling tower', ...keywords],
  });
}

export const inducedDraftCoolingTower = /* @__PURE__ */ tower(
  'induced-draft-cooling-tower',
  'Cooling tower · induced draft crossflow',
  29,
  [
    'M9 71H97V79H9V71ZM97 75H105M9 21H97L81 71H25L9 21ZM41 21V9H65V21M41 5L65 13M41 13L65 5M94 29H105',
  ],
  'M25 33L37 59M81 33L69 59',
  ['induced draft', 'crossflow'],
);

export const forcedDraftCoolingTower = /* @__PURE__ */ tower(
  'forced-draft-cooling-tower',
  'Cooling tower · forced draft counterflow',
  19,
  [BASIN, 'M25 9H81V71H25V9ZM25 55H13V67H25M19 55V67M81 19H105'],
  'M29 19H77M29 33H77M29 43H77M29 53H77',
  ['forced draft', 'counterflow'],
);

export const naturalDraftCoolingTower = /* @__PURE__ */ tower(
  'natural-draft-cooling-tower',
  'Cooling tower · natural draft counterflow',
  19,
  [
    BASIN,
    'M25 9H81V71H25V9ZM25 49L17 53M25 57L17 61M25 65L17 69M81 49L89 53M81 57L89 61M81 65L89 69M81 19H105',
  ],
  'M29 19H77M29 33H77M29 43H77',
  ['natural draft', 'counterflow'],
);

export const hyperbolicCoolingTower = /* @__PURE__ */ tower(
  'hyperbolic-cooling-tower',
  'Cooling tower · hyperbolic chimney',
  61,
  [BASIN, 'M33 1C39 25 33 45 21 71H85C73 45 67 25 73 1H33ZM81 61H105'],
  'M27 61H79',
  ['hyperbolic', 'chimney', 'natural draft'],
);

// Columns.

const COLUMN = 'M11 21A20 20 0 0 1 51 21V101A20 20 0 0 1 11 101Z';

/* @__NO_SIDE_EFFECTS__ */
function fractionator(id: string, name: string, internals: Part, keywords: string[]): SymbolDef {
  return sym({
    type: `pid/${id}`,
    name,
    category: PROCESS,
    size: [62, 122],
    ports: [
      port('feed', 1, 61, 'left'),
      port('overhead', 31, 1, 'top'),
      port('bottoms', 31, 121, 'bottom'),
      port('reflux', 61, 33, 'right'),
      port('reboil', 61, 89, 'right'),
    ],
    parts: [{ d: COLUMN }, { d: 'M1 61H11M51 33H61M51 89H61' }, internals],
    keywords: ['column', 'tower', ...keywords],
  });
}

export const trayColumn = /* @__PURE__ */ fractionator(
  'tray-column',
  'Tray column',
  { d: 'M11 33H41M21 47H51M11 61H41M21 75H51M11 89H41', dash: '4 3' },
  ['plate tower', 'distillation', 'bubble cap', 'sieve', 'valve tray'],
);

export const packedColumn = /* @__PURE__ */ fractionator(
  'packed-column',
  'Packed column',
  {
    d: 'M11 27H51M11 55H51M11 27L51 55M51 27L11 55M11 67H51M11 95H51M11 67L51 95M51 67L11 95',
  },
  ['packed tower', 'distillation', 'structured packing'],
);

/** Absorber / contactor: gas rises against a falling liquid (amine or glycol contactor). */
export const contactorColumn = /* @__PURE__ */ sym({
  type: 'pid/contactor-column',
  name: 'Contactor column',
  category: PROCESS,
  size: [62, 122],
  ports: [
    port('gas-in', 1, 97, 'left'),
    port('gas-out', 31, 1, 'top'),
    port('liquid-in', 61, 29, 'right'),
    port('liquid-out', 31, 121, 'bottom'),
  ],
  parts: [
    { d: COLUMN },
    { d: 'M1 97H11M51 29H61' },
    { d: 'M11 37H51M11 53H51M11 69H51M11 85H51', dash: '4 3' },
  ],
  keywords: ['column', 'tower', 'absorber', 'amine', 'glycol', 'dehydration', 'TEG'],
});

// Dampers and louvers.

export const damper = /* @__PURE__ */ inline(
  'damper',
  'Damper / louver',
  PROCESS,
  [106, 34],
  17,
  [{ d: 'M1 17H37M69 17H105M37 5H61L45 29H69' }],
  { keywords: ['damper', 'louver', 'duct'] },
);

export const parallelBladeDamper = /* @__PURE__ */ inline(
  'parallel-blade-damper',
  'Parallel blade damper',
  PROCESS,
  [106, 34],
  17,
  [{ d: 'M1 17H37M69 17H105M37 1H69V33H37V1ZM43 11L63 5M43 20L63 14M43 29L63 23' }],
  { keywords: ['damper', 'louver', 'duct'] },
);

export const opposedBladeDamper = /* @__PURE__ */ inline(
  'opposed-blade-damper',
  'Opposed blade damper',
  PROCESS,
  [106, 34],
  17,
  [{ d: 'M1 17H37M69 17H105M37 1H69V33H37V1ZM43 5L63 11M43 20L63 14M43 23L63 29' }],
  { keywords: ['damper', 'louver', 'duct'] },
);
