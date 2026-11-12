import type { DataRecord, LinkKind, PortDef, PortDirection, SymbolDef } from '@pipeline-view/core';

/** Palette categories, named exactly like the section titles of the Figma reference sheet. */
export const VALVES = 'Valves';
export const ACTUATION = 'Actuation & protection';
export const EQUIPMENT = 'Gas equipment';
export const INSTRUMENTATION = 'Instrumentation';
export const PIPING = 'Piping & signals';
export const PROCESS = 'Process equipment';

/** Link kinds an instrument signal port accepts. */
export const SIGNAL_KINDS: LinkKind[] = ['signal', 'electrical', 'pneumatic'];

/** Data bound by valve symbols. `open: false` draws the body filled (closed); anything else draws it open. */
export interface ValveData extends DataRecord {
  open?: boolean;
}

/** What kind of device a bubble stands for (ISA-5.1). It sets the outline. */
export type InstrumentDevice = 'discrete' | 'shared' | 'computer' | 'plc';

/** Where the device sits and whether the operator can reach it (ISA-5.1). It sets the line through the bubble. */
export type InstrumentLocation =
  'field' | 'panel' | 'behind-panel' | 'local-panel' | 'behind-local-panel';

/**
 * Data bound by instrument bubbles. `letters` is the tag (for example "PT") and `loop` the loop number
 * (for example 101). The rest redraws the bubble, so one symbol covers every ISA-5.1 combination:
 * `device` picks the outline (circle, circle in a square, hexagon, diamond in a square), `location`
 * the line through it (none, solid, dashed, double, double dashed), and `high` / `low` are short
 * texts outside the bubble at the upper and lower right, for example the alarm levels "HH" and "L"
 * or an analyte. A value that is missing or unknown falls back to the symbol's own default.
 */
export interface InstrumentData extends DataRecord {
  letters?: string;
  loop?: string | number;
  device?: InstrumentDevice;
  location?: InstrumentLocation;
  high?: string;
  low?: string;
}

export interface Part {
  /** Path data in the symbol's local coordinates. */
  d: string;
  /** 'bg' is filled with the canvas background, so it hides the linework behind it. 'ink' is filled with currentColor. */
  fill?: 'bg' | 'ink';
  dash?: string;
  /** The part is filled with currentColor when the valve is closed. */
  closable?: boolean;
}

export interface Label {
  text: string;
  x: number;
  y: number;
  size: number;
  weight?: number;
  /** Default: centred on `x`. */
  anchor?: 'start';
}

const FILL_BG = 'style="fill:var(--pv-symbol-fill,var(--pv-bg,Canvas))"';

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape text for use inside SVG markup. Data bound from the host is never trusted. */
/* @__NO_SIDE_EFFECTS__ */
export function esc(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]!);
}

/* @__NO_SIDE_EFFECTS__ */
export function port(
  id: string,
  x: number,
  y: number,
  direction: PortDirection,
  accepts?: LinkKind[],
): PortDef {
  return accepts
    ? { id, position: { x, y }, direction, accepts }
    : { id, position: { x, y }, direction };
}

/* @__NO_SIDE_EFFECTS__ */
export function part(p: Part, closed = false): string {
  let fill = '';
  if (p.fill === 'ink' || (closed && (p.closable || p.fill === 'bg')))
    fill = ' fill="currentColor"';
  else if (p.fill === 'bg') fill = ' ' + FILL_BG;
  const dash = p.dash ? ` stroke-dasharray="${p.dash}"` : '';
  return `<path d="${p.d}"${fill}${dash}/>`;
}

/* @__NO_SIDE_EFFECTS__ */
export function text(t: Label): string {
  return (
    `<text x="${t.x}" y="${t.y}" text-anchor="${t.anchor ?? 'middle'}" fill="currentColor" stroke="none" ` +
    `style="font:${t.weight ?? 500} ${t.size}px var(--pv-font,system-ui,sans-serif)">${esc(t.text)}</text>`
  );
}

/** Root group: all linework is stroke-based and follows currentColor (FR-35). */
/* @__NO_SIDE_EFFECTS__ */
export function group(inner: string): string {
  return `<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;
}

export interface SymbolSpec extends Omit<SymbolDef, 'svg' | 'render' | 'size'> {
  size: [width: number, height: number];
  parts: Part[];
  labels?: Label[];
}

/** Build a static symbol. Symbols with closable parts also get a render() bound to `data.open`. */
/* @__NO_SIDE_EFFECTS__ */
export function sym(spec: SymbolSpec): SymbolDef {
  const { size, parts, labels = [], ...rest } = spec;
  const draw = (closed: boolean) =>
    group(parts.map((p) => part(p, closed)).join('') + labels.map(text).join(''));
  const svg = draw(false);
  const def: SymbolDef = { ...rest, size: { width: size[0], height: size[1] }, svg };
  if (parts.some((p) => p.closable)) {
    const closedSvg = draw(true);
    def.render = ({ data }) => ((data as ValveData).open === false ? closedSvg : svg);
  }
  return def;
}

// Instrument bubbles (ISA-5.1). All of them are 60 px shapes centred at (31, 31), with an optional
// process tap stem down to y = 79.
const CIRCLE =
  'M31 61C47.5685 61 61 47.5685 61 31C61 14.4315 47.5685 1 31 1C14.4315 1 1 14.4315 1 31C1 47.5685 14.4315 61 31 61Z';
const SQUARE = 'M1 1H61V61H1Z';
const OUTLINES: Record<InstrumentDevice, string> = {
  discrete: CIRCLE,
  shared: SQUARE + CIRCLE,
  computer: 'M1 31L16 1H46L61 31L46 61H16Z',
  plc: SQUARE + 'M31 1L61 31L31 61L1 31Z',
};
/** The double line of a local panel, cut to the outline's width at that height. */
const DOUBLE_LINES: Record<InstrumentDevice, string> = {
  discrete: 'M1.2 28H60.8M1.2 34H60.8',
  shared: 'M1.2 28H60.8M1.2 34H60.8',
  computer: 'M2.5 28H59.5M2.5 34H59.5',
  plc: 'M4 28H58M4 34H58',
};
const DEVICES = Object.keys(OUTLINES) as InstrumentDevice[];
const LOCATIONS: InstrumentLocation[] = [
  'field',
  'panel',
  'behind-panel',
  'local-panel',
  'behind-local-panel',
];

/** Everything that decides how a bubble is drawn. */
export interface Bubble {
  letters: string;
  /** Second line: the loop number, or a fixed text such as an analyte. */
  sub?: string;
  device: InstrumentDevice;
  location: InstrumentLocation;
  high?: string;
  low?: string;
  /** Draw the process tap stem below the bubble. */
  stem: boolean;
}

/* @__NO_SIDE_EFFECTS__ */
export function drawBubble(b: Bubble): string {
  const { letters, sub, device, location } = b;
  const lined = location !== 'field';
  const double = location.endsWith('local-panel');
  const labels: Label[] = [];
  if (device === 'plc') {
    // A diamond leaves little room: small text, close to the middle.
    const size = letters.length <= 4 ? 11 : 9;
    const y = double ? 24.5 : lined ? 26.5 : sub ? 28.5 : 35;
    labels.push({ text: letters, x: 31, y, size });
    if (sub)
      labels.push({ text: sub, x: 31, y: double ? 44.5 : lined ? 42 : 41, size: 10, weight: 400 });
  } else {
    // The hexagon narrows towards the top, and a double line takes room from the letters.
    const small = device === 'computer' || double;
    const n = letters.length;
    const size = small ? (n <= 3 ? 17 : n === 4 ? 14 : 12) : n <= 3 ? 19 : n === 4 ? 16 : 13;
    if (!lined) {
      const y = sub ? 30.4 : Math.round((31 + size * 0.34) * 10) / 10;
      labels.push({ text: letters, x: 31, y, size });
      if (sub) labels.push({ text: sub, x: 31, y: 49.9, size: 12, weight: 400 });
    } else {
      labels.push({ text: letters, x: 31, y: double ? 23.5 : small ? 26 : 27.4, size });
      if (sub) {
        const y = double ? 50 : small ? 48 : 48.7;
        labels.push({ text: sub, x: 31, y, size: small ? 12 : 13, weight: 400 });
      }
    }
  }
  // Qualifiers sit outside the outline: in the corner a round or six-sided shape leaves free, or
  // beyond a square one.
  const qx = device === 'shared' || device === 'plc' ? 65 : 56;
  if (b.high) labels.push({ text: b.high, x: qx, y: 10, size: 11, anchor: 'start' });
  if (b.low) labels.push({ text: b.low, x: qx, y: 60, size: 11, anchor: 'start' });
  const parts = [part({ d: OUTLINES[device] + (b.stem ? 'M31 61V79' : '') })];
  if (lined) {
    parts.push(
      part({
        d: double ? DOUBLE_LINES[device] : 'M1 31H61',
        ...(location.startsWith('behind') ? { dash: '5 4' } : {}),
      }),
    );
  }
  return group(parts.join('') + labels.map(text).join(''));
}

const optional = (v: unknown): string | undefined =>
  v === undefined || v === null || v === '' ? undefined : String(v);

/** The bubble a node's data asks for, on top of the symbol's own defaults. Data is never trusted. */
/* @__NO_SIDE_EFFECTS__ */
export function bubbleFor(data: InstrumentData | undefined, defaults: Bubble): Bubble {
  const d = data ?? {};
  return {
    letters: optional(d.letters) ?? defaults.letters,
    sub: optional(d.loop) ?? defaults.sub,
    device: DEVICES.includes(d.device!) ? d.device! : defaults.device,
    location: LOCATIONS.includes(d.location!) ? d.location! : defaults.location,
    high: optional(d.high) ?? defaults.high,
    low: optional(d.low) ?? defaults.low,
    stem: defaults.stem,
  };
}

/** True when two bubbles draw the same. */
export function sameBubble(a: Bubble, b: Bubble): boolean {
  return (
    a.letters === b.letters &&
    a.sub === b.sub &&
    a.device === b.device &&
    a.location === b.location &&
    a.high === b.high &&
    a.low === b.low &&
    a.stem === b.stem
  );
}

/** The three ports of a bubble on a tap stem. `dx` shifts them with the bubble. */
/* @__NO_SIDE_EFFECTS__ */
export function bubblePorts(input: boolean, tap = true, dx = 0): PortDef[] {
  const ports = tap ? [port('tap', 31 + dx, 79, 'bottom')] : [];
  ports.push(port('signal', 61 + dx, 31, 'right', SIGNAL_KINDS));
  if (input) ports.push(port('input', 1 + dx, 31, 'left', SIGNAL_KINDS));
  return ports;
}

export interface InstrumentSpec {
  type: string;
  ref?: number;
  name: string;
  letters: string;
  /** Second line shown when no loop number is bound, for example the analyte of an analyzer. */
  sub?: string;
  /** Panel-mounted (horizontal line through the bubble). Short for `location: 'panel'`. */
  panel?: boolean;
  device?: InstrumentDevice;
  location?: InstrumentLocation;
  /** Add the `input` signal port on the left. Default: when the bubble isn't field-mounted. */
  input?: boolean;
  keywords?: string[];
}

/**
 * ISA-5.1 instrument bubble on a tap stem. The spec gives its defaults; tag letters, loop number,
 * device, location and qualifiers come from data (see `InstrumentData`), so every such symbol is a
 * preset of the same drawing.
 */
/* @__NO_SIDE_EFFECTS__ */
export function instrument(spec: InstrumentSpec): SymbolDef<InstrumentData> {
  const { letters, sub, panel = false, device = 'discrete', location, input, ...rest } = spec;
  const base: Bubble = {
    letters,
    sub,
    device,
    location: location ?? (panel ? 'panel' : 'field'),
    high: undefined,
    low: undefined,
    stem: true,
  };
  const svg = drawBubble(base);
  return {
    ...rest,
    category: INSTRUMENTATION,
    size: { width: 62, height: 80 },
    ports: bubblePorts(input ?? base.location !== 'field'),
    svg,
    render: (ctx) => {
      const b = bubbleFor(ctx.data, base);
      return sameBubble(b, base) ? svg : drawBubble(b);
    },
  };
}
