import type { SymbolDef } from '@pipeline-view/core';
import {
  type Bubble,
  INSTRUMENTATION,
  type InstrumentData,
  bubbleFor,
  bubblePorts,
  drawBubble,
  port,
  sameBubble,
} from '../shared';

/** Data bound by the inline instrument: the bubble's data, and optional flow-element marks. */
export interface InlineInstrumentData extends InstrumentData {
  /** Draw flow-element marks (two bars) on the pipe, for example for an orifice or flow meter. */
  flowElement?: boolean;
}

const PIPE = '<path d="M0 79H80"/>';
const BARS = '<path d="M35 71V87M45 71V87"/>';

/** A bubble on a short tap above a pipe that runs through, 80 × 88. */
/* @__NO_SIDE_EFFECTS__ */
export function drawInline(b: Bubble, bars: boolean): string {
  return (
    `<g fill="none" stroke="currentColor" stroke-width="2">${PIPE}${bars ? BARS : ''}</g>` +
    `<g transform="translate(9 0)">${drawBubble(b)}</g>`
  );
}

export const INLINE_SIZE = { width: 80, height: 88 };

/** Pipe ports `in` / `out`, and the bubble's signal ports. */
/* @__NO_SIDE_EFFECTS__ */
export function inlinePorts(input: boolean) {
  return [
    { ...port('in', 0, 79, 'left'), role: 'in' as const },
    { ...port('out', 80, 79, 'right'), role: 'out' as const },
    ...bubblePorts(input, false, 9),
  ];
}

const BASE: Bubble = {
  letters: 'FT',
  sub: undefined,
  device: 'discrete',
  location: 'field',
  high: undefined,
  low: undefined,
  stem: true,
};

const svg = /* @__PURE__ */ drawInline(BASE, false);

/**
 * An instrument that sits in the line: the pipe runs through, with the ISA bubble on a short tap above.
 * Letters, loop, device and location come from data, like the other instrument bubbles.
 */
export const inlineInstrument: SymbolDef<InlineInstrumentData> = {
  type: 'process/inline-instrument',
  name: 'Inline instrument',
  category: INSTRUMENTATION,
  size: INLINE_SIZE,
  ports: /* @__PURE__ */ inlinePorts(false),
  svg,
  render: ({ data }) => {
    const b = bubbleFor(data, BASE);
    const bars = data.flowElement === true;
    return !bars && sameBubble(b, BASE) ? svg : drawInline(b, bars);
  },
  keywords: ['inline', 'in-line', 'sensor', 'meter', 'flow element', 'transmitter'],
};
