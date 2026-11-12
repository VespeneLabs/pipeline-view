import type { SymbolDef } from '@pipeline-view/core';
import { EQUIPMENT, type Part, port, sym } from '../shared';
import { circle } from './kit';

// Compressors and drivers.

const CASING = 'M22 32A31 31 0 1 0 84 32A31 31 0 1 0 22 32Z';
const NOZZLES = 'M1 32H22M84 32H105';

/** Same footprint and ports as the gas pack's compressors. */
/* @__NO_SIDE_EFFECTS__ */
function compressor(id: string, name: string, parts: Part[], keywords: string[]): SymbolDef {
  return sym({
    type: `pid/${id}`,
    name,
    category: EQUIPMENT,
    size: [106, 64],
    ports: [port('suction', 1, 32, 'left'), port('discharge', 105, 32, 'right')],
    parts,
    keywords,
  });
}

export const axialCompressor = /* @__PURE__ */ compressor(
  'axial-compressor',
  'Axial compressor',
  [{ d: 'M1 32H25M81 32H105M25 9L81 21V43L25 55V9ZM39 12V52M53 15V49M67 18V46' }],
  ['compressor', 'axial'],
);

export const turbineDrivenCompressor = /* @__PURE__ */ sym({
  type: 'pid/turbine-driven-compressor',
  name: 'Centrifugal compressor · turbine driven',
  category: EQUIPMENT,
  size: [130, 64],
  ports: [port('suction', 76, 1, 'top'), port('discharge', 129, 32, 'right')],
  parts: [
    { d: 'M1 24L29 14V50L1 40V24ZM29 32H45M107 32H129' },
    { d: 'M45 32A31 31 0 1 0 107 32A31 31 0 1 0 45 32Z' },
    { d: 'M51 13L101 22V42L51 51V13Z' },
  ],
  labels: [{ text: 'T', x: 15, y: 36.5, size: 12, weight: 600 }],
  keywords: ['compressor', 'turbine', 'turbo compressor'],
});

export const centrifugalBlower = /* @__PURE__ */ sym({
  type: 'pid/centrifugal-blower',
  name: 'Centrifugal blower',
  category: EQUIPMENT,
  size: [106, 62],
  ports: [port('suction', 1, 36, 'left'), port('discharge', 105, 20, 'right')],
  parts: [{ d: 'M1 36H21M45 12H105V28H67.6' }, { d: circle(45, 36, 24) }, { d: circle(45, 36, 7) }],
  keywords: ['blower', 'fan'],
});

export const positiveDisplacementBlower = /* @__PURE__ */ compressor(
  'positive-displacement-blower',
  'Positive-displacement blower',
  [{ d: CASING }, { d: NOZZLES }, { d: circle(42, 32, 11) }, { d: circle(64, 32, 11) }],
  ['blower', 'roots', 'lobe'],
);

export const rotaryCompressor = /* @__PURE__ */ compressor(
  'rotary-compressor',
  'Rotary compressor',
  [
    { d: 'M1 32H33M73 32H105M33 1H73V63H33V1Z' },
    { d: circle(53, 17, 13) },
    { d: circle(53, 47, 13) },
  ],
  ['compressor', 'lobe', 'rotary'],
);

export const rotaryCompressorWithSilencers = /* @__PURE__ */ sym({
  type: 'pid/rotary-compressor-with-silencers',
  name: 'Rotary compressor with silencers',
  category: EQUIPMENT,
  size: [150, 64],
  ports: [port('suction', 1, 32, 'left'), port('discharge', 149, 32, 'right')],
  parts: [
    {
      d: 'M1 32H13M33 32H55M95 32H117M137 32H149M55 1H95V63H55V1ZM13 11A10 10 0 0 1 33 11V53A10 10 0 0 1 13 53ZM117 11A10 10 0 0 1 137 11V53A10 10 0 0 1 117 53Z',
    },
    { d: circle(75, 17, 13) },
    { d: circle(75, 47, 13) },
  ],
  keywords: ['compressor', 'lobe', 'rotary', 'silencer'],
});

export const liquidRingCompressor = /* @__PURE__ */ compressor(
  'liquid-ring-compressor',
  'Liquid ring compressor',
  [
    { d: CASING },
    { d: NOZZLES },
    { d: circle(53, 37, 14) },
    { d: 'M53 23V13M65 30L74 25M65 44L74 49M53 51V59M41 44L32 49M41 30L32 25' },
  ],
  ['compressor', 'liquid ring', 'vacuum'],
);

export const motor = /* @__PURE__ */ sym({
  type: 'pid/motor',
  name: 'Electric motor',
  category: EQUIPMENT,
  size: [56, 44],
  ports: [port('power', 1, 22, 'left', ['electrical']), port('shaft', 55, 22, 'right')],
  parts: [{ d: circle(22, 22, 21) }, { d: 'M43 22H55' }],
  labels: [{ text: 'M', x: 22, y: 28.1, size: 18, weight: 600 }],
  keywords: ['motor', 'driver'],
});

export const dieselEngine = /* @__PURE__ */ sym({
  type: 'pid/diesel-engine',
  name: 'Diesel engine',
  category: EQUIPMENT,
  size: [66, 44],
  ports: [port('shaft', 1, 22, 'left')],
  parts: [
    {
      d: 'M1 22H13M13 5H49V39H13V5ZM49 22H57M57 22C51 14 51 6 57 2C63 6 63 14 57 22C63 30 63 38 57 42C51 38 51 30 57 22Z',
    },
  ],
  keywords: ['diesel motor', 'engine', 'driver'],
});

export const turbineDriver = /* @__PURE__ */ sym({
  type: 'pid/turbine-driver',
  name: 'Turbine driver',
  category: EQUIPMENT,
  size: [78, 56],
  ports: [port('in', 25, 1, 'top'), port('out', 53, 55, 'bottom'), port('shaft', 77, 28, 'right')],
  parts: [{ d: 'M17 18L61 6V50L17 38V18ZM61 28H77M25 15.8V1M53 47.8V55' }],
  keywords: ['turbine', 'expander', 'steam turbine', 'gas turbine', 'driver'],
});

export const generator = /* @__PURE__ */ sym({
  type: 'pid/generator',
  name: 'Generator',
  category: EQUIPMENT,
  size: [56, 44],
  ports: [port('shaft', 1, 22, 'left'), port('power', 55, 22, 'right', ['electrical'])],
  parts: [{ d: circle(34, 22, 21) }, { d: 'M1 22H13' }],
  labels: [{ text: 'G', x: 34, y: 28.1, size: 18, weight: 600 }],
  keywords: ['generator', 'alternator'],
});

// Heat transfer.

export const plateHeatExchanger = /* @__PURE__ */ sym({
  type: 'pid/plate-heat-exchanger',
  name: 'Plate-and-frame exchanger',
  category: EQUIPMENT,
  size: [106, 64],
  ports: [
    port('hot-in', 1, 15, 'left'),
    port('hot-out', 1, 49, 'left'),
    port('cold-in', 105, 49, 'right'),
    port('cold-out', 105, 15, 'right'),
  ],
  parts: [
    {
      d: 'M1 15H25M1 49H25M81 15H105M81 49H105M25 5H81V59H25V5ZM33 5V59M41 5V59M49 5V59M57 5V59M65 5V59M73 5V59',
    },
  ],
  keywords: ['PHE', 'plate exchanger', 'heat exchanger'],
});

export const doublePipeExchanger = /* @__PURE__ */ sym({
  type: 'pid/double-pipe-exchanger',
  name: 'Double-pipe exchanger',
  category: EQUIPMENT,
  size: [106, 44],
  ports: [
    port('tube-in', 1, 22, 'left'),
    port('tube-out', 105, 22, 'right'),
    port('shell-in', 33, 1, 'top'),
    port('shell-out', 73, 43, 'bottom'),
  ],
  parts: [{ d: 'M1 22H105M21 13H85V31H21V13ZM33 13V1M73 31V43' }],
  keywords: ['heat exchanger', 'jacketed pipe'],
});

export const hairpinExchanger = /* @__PURE__ */ sym({
  type: 'pid/hairpin-exchanger',
  name: 'Hairpin exchanger',
  category: EQUIPMENT,
  size: [106, 60],
  ports: [
    port('tube-in', 1, 16, 'left'),
    port('tube-out', 1, 44, 'left'),
    port('shell-in', 33, 59, 'bottom'),
    port('shell-out', 33, 1, 'top'),
  ],
  parts: [
    {
      d: 'M1 16H21M1 44H21M21 9H77V23H21V9ZM21 37H77V51H21V37ZM77 16H87A14 14 0 0 1 87 44H77M33 9V1M33 51V59',
    },
  ],
  keywords: ['heat exchanger', 'hairpin'],
});

export const uTubeExchanger = /* @__PURE__ */ sym({
  type: 'pid/u-tube-exchanger',
  name: 'U-tube exchanger',
  category: EQUIPMENT,
  size: [106, 58],
  ports: [
    port('tube-in', 19, 1, 'top'),
    port('tube-out', 19, 57, 'bottom'),
    port('shell-in', 45, 1, 'top'),
    port('shell-out', 75, 57, 'bottom'),
  ],
  parts: [
    { d: 'M13 9H25V49H13V9ZM25 13H85A16 16 0 0 1 85 45H25M19 9V1M19 49V57M45 13V1M75 45V57' },
    { d: 'M25 23H77A6 6 0 0 1 77 35H25', dash: '3 3' },
  ],
  keywords: ['heat exchanger', 'TEMA BEU'],
});

export const kettleReboiler = /* @__PURE__ */ sym({
  type: 'pid/kettle-reboiler',
  name: 'Kettle reboiler',
  category: EQUIPMENT,
  size: [110, 60],
  ports: [
    port('tube-in', 1, 31, 'left'),
    port('tube-out', 1, 43, 'left'),
    port('feed', 37, 59, 'bottom'),
    port('vapor', 69, 1, 'top'),
    port('liquid', 79, 59, 'bottom'),
  ],
  parts: [
    {
      d: 'M1 31H5M1 43H5M5 25H17V49H5V25ZM17 25H37L51 11H87A19 19 0 0 1 87 49H17M69 11V1M79 49V59M37 49V59',
    },
    { d: 'M17 33H77V43H17', dash: '3 3' },
  ],
  keywords: ['reboiler', 'heat exchanger', 'TEMA BKU', 'vaporizer'],
});

export const spiralExchanger = /* @__PURE__ */ sym({
  type: 'pid/spiral-exchanger',
  name: 'Spiral exchanger',
  category: EQUIPMENT,
  size: [106, 64],
  ports: [
    port('hot-in', 1, 32, 'left'),
    port('hot-out', 105, 32, 'right'),
    port('cold-in', 53, 63, 'bottom'),
    port('cold-out', 53, 1, 'top'),
  ],
  parts: [
    { d: 'M1 32H26M80 32H105M53 5V1M53 59V63' },
    { d: circle(53, 32, 27) },
    { d: 'M53 32A5 5 0 0 1 53 22A10 10 0 0 1 53 42A15 15 0 0 1 53 12A20 20 0 0 1 53 52' },
  ],
  keywords: ['heat exchanger', 'spiral'],
});

const COIL = 'M36 32H44L49 22L57 42L62 32H70';

/* @__NO_SIDE_EFFECTS__ */
function duty(id: string, name: string, arrow: string, keywords: string[]): SymbolDef {
  return sym({
    type: `pid/${id}`,
    name,
    category: EQUIPMENT,
    size: [106, 64],
    ports: [port('in', 1, 32, 'left'), port('out', 105, 32, 'right')],
    parts: [{ d: 'M1 32H30M76 32H105' }, { d: circle(53, 32, 23) }, { d: COIL }, { d: arrow }],
    keywords,
  });
}

export const heater = /* @__PURE__ */ duty('heater', 'Heater', 'M31 54L77 8M67 9L77 8L76 18', [
  'heat exchanger',
  'preheater',
  'line heater',
]);

export const condenser = /* @__PURE__ */ duty(
  'condenser',
  'Condenser / cooler',
  'M75 10L29 56M39 55L29 56L30 46',
  ['heat exchanger', 'cooler', 'aftercooler'],
);

export const firedHeater = /* @__PURE__ */ sym({
  type: 'pid/fired-heater',
  name: 'Fired heater',
  category: EQUIPMENT,
  size: [106, 80],
  ports: [port('in', 1, 41, 'left'), port('out', 105, 65, 'right'), port('fuel', 53, 79, 'bottom')],
  parts: [
    { d: 'M21 31H85V79H21V31ZM21 31L41 13H65L85 31M45 13V1H61V13' },
    { d: 'M1 41H67L39 53H67L39 65H105' },
    { d: 'M47 79C47 73 53 73 53 69C53 73 59 73 59 79' },
  ],
  keywords: ['furnace', 'heater', 'line heater', 'bath heater'],
});

export const boiler = /* @__PURE__ */ sym({
  type: 'pid/boiler',
  name: 'Boiler',
  category: EQUIPMENT,
  size: [106, 64],
  ports: [port('feed', 1, 49, 'left'), port('steam', 105, 29, 'right')],
  parts: [{ d: 'M41 1V9L25 21V63H81V21L65 9V1M1 49H25M81 29H105M25 37H81' }],
  keywords: ['steam generator', 'hot water'],
});

export const electricHeater = /* @__PURE__ */ sym({
  type: 'pid/electric-heater',
  name: 'Electric heater',
  category: EQUIPMENT,
  size: [106, 42],
  ports: [
    port('in', 1, 21, 'left'),
    port('out', 105, 21, 'right'),
    port('power', 53, 1, 'top', ['electrical']),
  ],
  parts: [
    { d: 'M1 21H29M77 21H105M29 5H77V37H29V5ZM53 5V1' },
    { d: 'M35 21L39 13L45 29L51 13L57 29L63 13L69 29L71 21' },
  ],
  keywords: ['heater', 'immersion heater'],
});

// Separation and vessel internals.

export const cycloneSeparator = /* @__PURE__ */ sym({
  type: 'pid/cyclone-separator',
  name: 'Cyclone separator',
  category: EQUIPMENT,
  size: [62, 84],
  ports: [port('in', 1, 17, 'left'), port('out', 41, 1, 'top'), port('drain', 41, 83, 'bottom')],
  parts: [{ d: 'M1 17H21M41 9V1M41 75V83M21 9H61V37L45 75H37L21 37V9Z' }],
  keywords: ['cyclone', 'separator', 'dust'],
});

export const threePhaseSeparator = /* @__PURE__ */ sym({
  type: 'pid/three-phase-separator',
  name: 'Gravity separator · three phase',
  category: EQUIPMENT,
  size: [120, 60],
  ports: [
    port('in', 33, 1, 'top'),
    port('gas', 87, 1, 'top'),
    port('water', 55, 59, 'bottom'),
    port('oil', 97, 59, 'bottom'),
  ],
  parts: [
    {
      d: 'M27 5H93A22 22 0 0 1 93 49H27A22 22 0 0 1 27 5ZM83 49V29M33 5V1M87 5V1M55 49V59M97 48.6V59',
    },
    { d: 'M9 31H83', dash: '4 3' },
  ],
  keywords: ['separator', 'gravity', 'weir', 'slug catcher'],
});

export const impactSeparator = /* @__PURE__ */ sym({
  type: 'pid/impact-separator',
  name: 'Impact separator',
  category: EQUIPMENT,
  size: [62, 84],
  ports: [port('in', 1, 19, 'left'), port('out', 61, 19, 'right'), port('drain', 31, 83, 'bottom')],
  parts: [{ d: 'M1 19H11M51 19H61M31 73V83M11 1H51V55L31 73L11 55V1ZM31 1V37' }],
  keywords: ['separator', 'baffle', 'impingement'],
});

export const gasFilter = /* @__PURE__ */ sym({
  type: 'pid/gas-filter',
  name: 'Gas filter',
  category: EQUIPMENT,
  size: [106, 82],
  ports: [port('in', 1, 36, 'left'), port('out', 105, 36, 'right')],
  parts: [
    { d: 'M1 36H32M74 36H105M32 1H74V81H32V1Z' },
    { d: 'M32 16H74M32 56L53 74L74 56', dash: '3 4' },
  ],
  keywords: ['filter', 'dust filter'],
});

export const liquidFilter = /* @__PURE__ */ sym({
  type: 'pid/liquid-filter',
  name: 'Liquid filter',
  category: EQUIPMENT,
  size: [106, 62],
  ports: [port('in', 1, 17, 'left'), port('out', 105, 45, 'right')],
  parts: [{ d: 'M1 17H32M74 45H105M32 1H74V61H32V1Z' }, { d: 'M32 31H74', dash: '3 4' }],
  keywords: ['filter'],
});

const VESSEL = 'M11 21A20 20 0 0 1 51 21V63A20 20 0 0 1 11 63Z';

/** Vertical vessel with a mist-eliminator pad below the gas outlet. */
export const vesselWithDemister = /* @__PURE__ */ sym({
  type: 'pid/vessel-with-demister',
  name: 'Vessel with demister',
  category: EQUIPMENT,
  size: [62, 84],
  ports: [port('in', 1, 47, 'left'), port('out', 31, 1, 'top'), port('drain', 31, 83, 'bottom')],
  parts: [
    { d: VESSEL },
    { d: 'M1 47H11' },
    { d: 'M11 21H51M11 31H51M11 21L21 31L31 21L41 31L51 21M11 31L21 21L31 31L41 21L51 31' },
  ],
  keywords: ['demister', 'mist eliminator', 'scrubber', 'separator'],
});

export const packedVessel = /* @__PURE__ */ sym({
  type: 'pid/packed-vessel',
  name: 'Vessel with packed section',
  category: EQUIPMENT,
  size: [62, 84],
  ports: [port('in', 1, 63, 'left'), port('out', 31, 1, 'top'), port('drain', 31, 83, 'bottom')],
  parts: [{ d: VESSEL }, { d: 'M1 63H11' }, { d: 'M11 27H51M11 55H51M11 27L51 55M51 27L11 55' }],
  keywords: ['packed bed', 'adsorber', 'dryer', 'molecular sieve'],
});

export const manway = /* @__PURE__ */ sym({
  type: 'pid/manway',
  name: 'Manway',
  category: EQUIPMENT,
  size: [16, 24],
  ports: [port('mount', 1, 12, 'left')],
  parts: [{ d: 'M1 8H11M1 16H11M11 3V21M15 3V21' }],
  keywords: ['manhole', 'access', 'nozzle'],
});

export const vortexBreaker = /* @__PURE__ */ sym({
  type: 'pid/vortex-breaker',
  name: 'Vortex breaker',
  category: EQUIPMENT,
  size: [30, 24],
  ports: [port('out', 15, 23, 'bottom')],
  parts: [{ d: 'M3 5H27M15 1V23' }],
  keywords: ['vessel internal', 'outlet nozzle'],
});
