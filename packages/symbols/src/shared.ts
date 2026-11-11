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

/** Data bound by instrument bubbles: tag letters (for example "PT") and loop number (for example 101). */
export interface InstrumentData extends DataRecord {
  letters?: string;
  loop?: string | number;
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
    `<text x="${t.x}" y="${t.y}" text-anchor="middle" fill="currentColor" stroke="none" ` +
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

// Instrument bubble: 60 px circle centred at (31, 31) with a process tap stem down to y = 79.
const BUBBLE =
  'M31 61C47.5685 61 61 47.5685 61 31C61 14.4315 47.5685 1 31 1C14.4315 1 1 14.4315 1 31C1 47.5685 14.4315 61 31 61ZM31 61V79';

export interface InstrumentSpec {
  type: string;
  ref: number;
  name: string;
  letters: string;
  /** Second line shown when no loop number is bound, for example the analyte of an analyzer. */
  sub?: string;
  /** Panel-mounted (horizontal line through the bubble). */
  panel?: boolean;
  keywords?: string[];
}

function letterSize(letters: string): number {
  return letters.length <= 3 ? 19 : letters.length === 4 ? 16 : 13;
}

export function drawInstrument(letters: string, sub: string | undefined, panel: boolean): string {
  const size = letterSize(letters);
  const labels: Label[] = [];
  if (panel) {
    labels.push({ text: letters, x: 31, y: 27.4, size });
    if (sub) labels.push({ text: sub, x: 31, y: 48.7, size: 13, weight: 400 });
  } else if (sub) {
    labels.push({ text: letters, x: 31, y: 30.4, size });
    labels.push({ text: sub, x: 31, y: 49.9, size: 12, weight: 400 });
  } else {
    labels.push({ text: letters, x: 31, y: Math.round((31 + size * 0.34) * 10) / 10, size });
  }
  const parts = [part({ d: BUBBLE })];
  if (panel) parts.push(part({ d: 'M1 31H61' }));
  return group(parts.join('') + labels.map(text).join(''));
}

/** ISA-5.1 style instrument bubble whose tag letters and loop number come from data. */
/* @__NO_SIDE_EFFECTS__ */
export function instrument(spec: InstrumentSpec): SymbolDef {
  const { letters, sub, panel = false, ...rest } = spec;
  const ports = [port('tap', 31, 79, 'bottom'), port('signal', 61, 31, 'right', SIGNAL_KINDS)];
  if (panel) ports.push(port('input', 1, 31, 'left', SIGNAL_KINDS));
  const svg = drawInstrument(letters, sub, panel);
  return {
    ...rest,
    category: INSTRUMENTATION,
    size: { width: 62, height: 80 },
    ports,
    svg,
    render: (ctx) => {
      const data = ctx.data as InstrumentData;
      const l = data.letters ? String(data.letters) : letters;
      const s = data.loop !== undefined && data.loop !== '' ? String(data.loop) : sub;
      return l === letters && s === sub ? svg : drawInstrument(l, s, panel);
    },
  };
}
