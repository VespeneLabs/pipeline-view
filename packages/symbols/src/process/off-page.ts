import type { DataRecord, SymbolDef } from '@pipeline-view/core';
import { PIPING, esc, group, part } from '../shared';

/** Data bound by off-page connectors: a tag such as "GAS", "N2" or a drawing reference. The symbol widens to fit it. */
export interface OffPageData extends DataRecord {
  text?: string;
}

/** Width that fits tags of up to about 7 characters; shorter tags keep it. */
const MIN_WIDTH = 96;
/** Estimated advance of one character of the 600-weight 13 px tag. No layout read, so it works without a DOM. */
const CHAR_WIDTH = 8.4;
/** Room the tag doesn't get: the body's left edge, the arrow head and a little air on both sides. */
const CHROME = 37;

/** The connector's width for a tag: it grows with the text and never goes below MIN_WIDTH. */
function widthFor(text: unknown): number {
  const chars = text === undefined || text === null ? 0 : String(text).length;
  return Math.max(MIN_WIDTH, Math.ceil(chars * CHAR_WIDTH + CHROME));
}

function draw(text: unknown): string {
  const t = text === undefined || text === '' ? '' : esc(text);
  const w = widthFor(text);
  return group(
    part({ d: `M1 1H${w - 22}L${w - 1} 18L${w - 22} 35H1Z`, fill: 'bg' }) +
      (t &&
        `<text x="${40 + (w - MIN_WIDTH) / 2}" y="22.5" text-anchor="middle" fill="currentColor" stroke="none" ` +
          `style="font:600 13px var(--pv-font,system-ui,sans-serif)">${t}</text>`),
  );
}

const svg = /* @__PURE__ */ draw('');

/* @__NO_SIDE_EFFECTS__ */
function offPage(inlet: boolean): SymbolDef<OffPageData> {
  return {
    type: inlet ? 'process/off-page-inlet' : 'process/off-page-outlet',
    name: inlet ? 'Off-page connector (inlet)' : 'Off-page connector (outlet)',
    category: PIPING,
    // The symbol grows with its tag, so a long tag stays inside the shape. The inlet's port is on the
    // right edge and moves with the width.
    size: (node) => ({ width: widthFor(node.data?.text), height: 36 }),
    ports: (node) => [
      inlet
        ? {
            id: 'out',
            position: { x: widthFor(node.data?.text) - 1, y: 18 },
            direction: 'right',
            role: 'out',
          }
        : { id: 'in', position: { x: 1, y: 18 }, direction: 'left', role: 'in' },
    ],
    svg,
    render: ({ data }) => (data.text === undefined || data.text === '' ? svg : draw(data.text)),
    keywords: [
      'off-page',
      'battery limit',
      'continuation',
      'utility',
      'terminal',
      inlet ? 'source' : 'sink',
    ],
  };
}

/** Where a line enters from another drawing or a utility. The tag comes from `data.text`. */
export const offPageInlet = /* @__PURE__ */ offPage(true);
/** Where a line leaves to another drawing or a utility. The tag comes from `data.text`. */
export const offPageOutlet = /* @__PURE__ */ offPage(false);
