import type { PortDef, PortDirection } from '@pipeline-view/core';
import { EQUIPMENT, type LevelShape, PROCESS, sym } from '../shared';
import { circle } from './kit';

// Gas supply (what a line starts at) and points of use (what it ends at).

/* @__NO_SIDE_EFFECTS__ */
function io(id: string, x: number, y: number, direction: PortDirection, out = false): PortDef {
  return { id, position: { x, y }, direction, role: out ? 'out' : 'in' };
}

/** One cylinder of a pack: its body from the shoulder down, 18 px wide from `x`. */
const packBody = (x: number) =>
  `M${x} 39C${x} 33 ${x + 4} 31 ${x + 6} 29H${x + 12}C${x + 14} 31 ${x + 18} 33 ${x + 18} 39V67H${x}Z`;
const PACK_AT = [11, 32, 53];

/** Cylinder pack (bundle): gas cylinders in one frame, manifolded to a single outlet. `data.level` fills them. */
export const cylinderPack = /* @__PURE__ */ sym({
  type: 'pid/cylinder-pack',
  name: 'Cylinder pack',
  category: PROCESS,
  size: [82, 72],
  ports: [io('out', 41, 1, 'top', true)],
  parts: [
    { d: 'M5 21H77V71H5Z' },
    { d: PACK_AT.map((x) => packBody(x) + `M${x + 6} 29V25H${x + 12}V29M${x + 9} 25V11`).join('') },
    { d: 'M20 11H62M41 11V1' },
  ],
  level: PACK_AT.map((x): LevelShape => ({ d: packBody(x), top: 29, bottom: 67 })),
  keywords: [
    'bundle',
    'cylinder bundle',
    'manifolded cylinder pack',
    'MCP',
    'gas cylinders',
    'rack',
  ],
});

const DEWAR_INNER =
  'M13 27A6 6 0 0 1 19 21H31A6 6 0 0 1 37 27V51A6 6 0 0 1 31 57H19A6 6 0 0 1 13 51Z';

/** Dewar: a portable vacuum-insulated vessel for cryogenic liquid. `data.level` fills the inner vessel. */
export const dewar = /* @__PURE__ */ sym({
  type: 'pid/dewar',
  name: 'Dewar',
  category: PROCESS,
  size: [50, 70],
  ports: [io('out', 25, 1, 'top', true)],
  parts: [
    { d: 'M7 23A10 10 0 0 1 17 13H33A10 10 0 0 1 43 23V53A10 10 0 0 1 33 63H17A10 10 0 0 1 7 53Z' },
    { d: DEWAR_INNER },
    { d: 'M25 21V1M15 13V7H35V13M13 62V69M37 62V69M9 69H17M33 69H41' },
  ],
  level: [{ d: DEWAR_INNER, top: 21, bottom: 57 }],
  keywords: ['liquid cylinder', 'cryogenic', 'liquid nitrogen', 'LIN', 'portable vessel', 'cryo'],
});

/** One tube of a trailer, 10 px high from `y`. */
const tube = (y: number) => `M14 ${y}H92A5 5 0 0 1 92 ${y + 10}H14A5 5 0 0 1 14 ${y}Z`;
const TUBES_AT = [3, 17, 31];

/** Tube trailer: long tubes of compressed gas on a road trailer, manifolded at the rear. `data.level` fills the tubes. */
export const tubeTrailer = /* @__PURE__ */ sym({
  type: 'pid/tube-trailer',
  name: 'Tube trailer',
  category: PROCESS,
  size: [122, 64],
  ports: [io('out', 121, 22, 'right', true)],
  parts: [
    { d: TUBES_AT.map(tube).join('') },
    { d: 'M97 8H105M97 36H105M105 8V36M97 22H121' },
    { d: 'M5 46H101M19 46V61M14 61H24' },
    { d: circle(72, 55, 7) + circle(90, 55, 7), fill: 'bg' },
  ],
  level: TUBES_AT.map((y): LevelShape => ({ d: tube(y), top: y, bottom: y + 10 })),
  keywords: ['trailer', 'tube bank', 'MEGC', 'compressed gas', 'hydrogen', 'helium', 'delivery'],
});

/** One adsorber tower, 14 px wide from `x`. */
const tower = (x: number) => `M${x} 22A7 7 0 0 1 ${x + 14} 22V46A7 7 0 0 1 ${x} 46Z`;

/** On-site gas generator: twin adsorber towers (PSA) between a feed and a product header. The feed inlet may stay unconnected. */
export const gasGenerator = /* @__PURE__ */ sym({
  type: 'pid/gas-generator',
  name: 'Gas generator',
  category: EQUIPMENT,
  size: [82, 68],
  ports: [io('in', 1, 34, 'left'), io('out', 81, 34, 'right', true)],
  parts: [{ d: tower(21) + tower(47) }, { d: 'M28 15V7H54V15M28 53V61H54V53M1 34H21M61 34H81' }],
  keywords: [
    'PSA',
    'pressure swing adsorption',
    'nitrogen generator',
    'oxygen generator',
    'membrane',
    'on-site generation',
    'twin tower',
  ],
});

/** Ambient vaporizer: a bank of finned tubes that boils cryogenic liquid with ambient air. */
export const ambientVaporizer = /* @__PURE__ */ sym({
  type: 'pid/ambient-vaporizer',
  name: 'Ambient vaporizer',
  category: EQUIPMENT,
  size: [82, 72],
  ports: [io('in', 1, 36, 'left'), io('out', 81, 36, 'right', true)],
  parts: [
    { d: 'M11 5H71V67H11ZM1 36H11M71 36H81' },
    { d: 'M21 13V59M31 13V59M41 13V59M51 13V59M61 13V59' },
  ],
  keywords: ['vaporiser', 'evaporator', 'ambient air vaporizer', 'AAV', 'cryogenic', 'finned'],
});

/** Analytical instrument: bench equipment that consumes gas at the end of a line, drawn as a cabinet with a signal trace. */
export const analyticalInstrument = /* @__PURE__ */ sym({
  type: 'pid/analytical-instrument',
  name: 'Analytical instrument',
  category: PROCESS,
  size: [72, 58],
  ports: [io('in', 1, 29, 'left')],
  parts: [
    { d: 'M11 1H71V53H11Z', fill: 'bg' },
    { d: 'M1 29H11M19 53V57M63 53V57' },
    { d: 'M19 41H27L31 15L35 41H42L46 27L50 41H63' },
  ],
  keywords: [
    'gas chromatograph',
    'GC',
    'GC-MS',
    'mass spectrometer',
    'ICP',
    'analyzer',
    'analyser',
    'lab instrument',
    'consumer',
  ],
});

const TORCH_NECK = 'H51L59 27.6M55.6 29.6L62.4 25.6L66.2 34.9L61.8 37.5Z';
const TORCH_FLAME = 'M62.6 39C62 43 66 46 69.5 47C70 43.5 69 39.5 67 37';

/** Welding torch: a gas consumer at the end of a line, with one gas inlet. */
export const weldingTorch = /* @__PURE__ */ sym({
  type: 'pid/welding-torch',
  name: 'Welding torch',
  category: PROCESS,
  size: [72, 50],
  ports: [io('in', 1, 14, 'left')],
  parts: [{ d: 'M11 8H41V20H11ZM1 14H11M41 14' + TORCH_NECK }, { d: TORCH_FLAME }],
  keywords: ['welding', 'torch', 'MIG', 'TIG', 'shielding gas', 'consumer'],
});

/** Cutting torch: like the welding torch, with a fuel gas and an oxygen inlet and a cutting lever. */
export const cuttingTorch = /* @__PURE__ */ sym({
  type: 'pid/cutting-torch',
  name: 'Cutting torch',
  category: PROCESS,
  size: [72, 50],
  ports: [io('fuel', 1, 18, 'left'), io('oxygen', 1, 10, 'left')],
  parts: [
    { d: 'M11 6H41V22H11ZM1 10H11M1 18H11M17 6L21 1H35M41 14' + TORCH_NECK },
    { d: TORCH_FLAME },
  ],
  keywords: ['cutting', 'oxy-fuel', 'oxyacetylene', 'torch', 'flame cutting', 'consumer'],
});
