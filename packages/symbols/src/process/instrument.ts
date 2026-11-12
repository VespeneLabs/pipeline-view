import type { NodeModel, SymbolDef } from '@pipeline-view/core';
import {
  type Bubble,
  INSTRUMENTATION,
  type InstrumentData,
  bubbleFor,
  bubblePorts,
  drawBubble,
  sameBubble,
} from '../shared';
import { INLINE_SIZE, drawInline, inlinePorts } from './inline-instrument';

/** How a bubble meets the process: on a tap stem, in the line, or on its own (signals only). */
export type InstrumentMounting = 'tap' | 'inline' | 'none';

/** Data bound by the generic instrument: everything a bubble takes, and how it is mounted. */
export interface InstrumentBubbleData extends InstrumentData {
  /**
   * 'tap' (the default) draws a stem down to a `tap` port. 'inline' draws a pipe through below the
   * bubble, with `in` / `out` ports. 'none' draws the bubble alone. The `signal` and `input` ports
   * keep their ids in every mounting; the size and the process ports follow it.
   */
  mounting?: InstrumentMounting;
}

const mountingOf = (data: InstrumentBubbleData | undefined): InstrumentMounting =>
  data?.mounting === 'inline' || data?.mounting === 'none' ? data.mounting : 'tap';

const BASE: Bubble = {
  letters: 'PI',
  sub: undefined,
  device: 'discrete',
  location: 'field',
  high: undefined,
  low: undefined,
  stem: true,
};

const SIZES = {
  tap: { width: 62, height: 80 },
  none: { width: 62, height: 62 },
  inline: INLINE_SIZE,
};
const PORTS = /* @__PURE__ */ (() => ({
  tap: bubblePorts(true),
  none: bubblePorts(true, false),
  inline: inlinePorts(true),
}))();

const svg = /* @__PURE__ */ drawBubble(BASE);

/**
 * Any ISA-5.1 instrument bubble from one symbol. Its data picks the tag letters and loop number, the
 * device (discrete, shared display, computer, PLC), the location (field, panel, behind panel, local
 * panel), qualifiers outside the bubble and the mounting, so an editor can offer a few fields instead
 * of a symbol per instrument. Metering elements with a shape of their own stay separate symbols.
 */
export const instrumentBubble: SymbolDef<InstrumentBubbleData> = {
  type: 'process/instrument',
  name: 'Instrument',
  category: INSTRUMENTATION,
  size: (node: NodeModel<InstrumentBubbleData>) => SIZES[mountingOf(node.data)],
  ports: (node: NodeModel<InstrumentBubbleData>) => PORTS[mountingOf(node.data)],
  svg,
  render: ({ data }) => {
    const mounting = mountingOf(data);
    const b = bubbleFor(data, { ...BASE, stem: mounting !== 'none' });
    if (mounting === 'inline') return drawInline(b, false);
    return sameBubble(b, BASE) ? svg : drawBubble(b);
  },
  keywords: ['bubble', 'balloon', 'ISA', 'tag', 'indicator', 'transmitter', 'controller', 'switch'],
};
