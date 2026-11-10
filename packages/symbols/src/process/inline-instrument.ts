import type { SymbolDef } from '@pipeline-view/core';
import { INSTRUMENTATION, type InstrumentData, SIGNAL_KINDS, drawInstrument } from '../shared';

/** Data bound by the inline instrument: tag letters, loop number, and optional flow-element marks. */
export interface InlineInstrumentData extends InstrumentData {
  /** Draw flow-element marks (two bars) on the pipe, for example for an orifice or flow meter. */
  flowElement?: boolean;
}

const PIPE = '<path d="M0 79H80"/>';
const BARS = '<path d="M35 71V87M45 71V87"/>';

function draw(letters: string, loop: string | undefined, bars: boolean): string {
  return (
    `<g fill="none" stroke="currentColor" stroke-width="2">${PIPE}${bars ? BARS : ''}</g>` +
    `<g transform="translate(9 0)">${drawInstrument(letters, loop, false)}</g>`
  );
}

const svg = /* @__PURE__ */ draw('FT', undefined, false);

/**
 * An instrument that sits in the line: the pipe runs through, with the ISA bubble on a short tap above.
 * Letters and loop come from data, like the other instrument bubbles.
 */
export const inlineInstrument: SymbolDef<InlineInstrumentData> = {
  type: 'process/inline-instrument',
  name: 'Inline instrument',
  category: INSTRUMENTATION,
  size: { width: 80, height: 88 },
  ports: [
    { id: 'in', position: { x: 0, y: 79 }, direction: 'left', role: 'in' },
    { id: 'out', position: { x: 80, y: 79 }, direction: 'right', role: 'out' },
    { id: 'signal', position: { x: 70, y: 31 }, direction: 'right', accepts: SIGNAL_KINDS },
  ],
  svg,
  render: ({ data }) => {
    const letters = data.letters ? String(data.letters) : 'FT';
    const loop = data.loop !== undefined && data.loop !== '' ? String(data.loop) : undefined;
    const bars = data.flowElement === true;
    return letters === 'FT' && loop === undefined && !bars ? svg : draw(letters, loop, bars);
  },
  keywords: ['inline', 'in-line', 'sensor', 'meter', 'flow element', 'transmitter'],
};
