import type { DataRecord, SymbolDef } from '@pipeline-view/core';
import { PROCESS, esc, group, part } from '../shared';

/** Data bound by the enclosure: a short tag written inside it. The symbol widens to fit it. */
export interface EnclosureData extends DataRecord {
  text?: string;
}

/** Width that fits tags of up to about 5 characters; shorter tags keep it. */
const MIN_WIDTH = 72;
/** Estimated advance of one character of the 600-weight 13 px tag. No layout read, so it works without a DOM. */
const CHAR_WIDTH = 8.4;
/** Room the tag doesn't get: the outlet stub and a little air on both sides. */
const CHROME = 28;
const HEIGHT = 64;
/** Length of the outlet stub right of the box. */
const STUB = 12;

/** The symbol's width for a tag: it grows with the text and never goes below MIN_WIDTH. */
function widthFor(text: unknown): number {
  const chars = text === undefined || text === null ? 0 : String(text).length;
  return Math.max(MIN_WIDTH, Math.ceil(chars * CHAR_WIDTH + CHROME));
}

function draw(text: unknown): string {
  const t = text === undefined || text === '' ? '' : esc(text);
  const w = widthFor(text);
  const box = w - STUB;
  return group(
    // The box, a ledge under its top edge that makes it read as a cabinet, and the pipe leaving it.
    part({ d: `M1 1H${box}V${HEIGHT - 1}H1Z`, fill: 'bg' }) +
      part({ d: `M1 11H${box}M${box} 32H${w}` }) +
      (t &&
        `<text x="${(box + 1) / 2}" y="41.5" text-anchor="middle" fill="currentColor" stroke="none" ` +
          `style="font:600 13px var(--pv-font,system-ui,sans-serif)">${t}</text>`),
  );
}

const svg = /* @__PURE__ */ draw('');

/**
 * Enclosure with an outlet: a cabinet or box that holds a source, with one pipe leaving it on the
 * right. A short tag comes from `data.text`; the box widens for a long one and the port moves with it.
 */
export const enclosure: SymbolDef<EnclosureData> = {
  type: 'process/enclosure',
  name: 'Enclosure with outlet',
  category: PROCESS,
  size: (node) => ({ width: widthFor(node.data?.text), height: HEIGHT }),
  ports: (node) => [
    {
      id: 'out',
      position: { x: widthFor(node.data?.text), y: 32 },
      direction: 'right',
      role: 'out',
    },
  ],
  svg,
  render: ({ data }) => (data.text === undefined || data.text === '' ? svg : draw(data.text)),
  keywords: ['cabinet', 'box', 'housing', 'source', 'supply', 'store', 'shelter', 'package'],
};
