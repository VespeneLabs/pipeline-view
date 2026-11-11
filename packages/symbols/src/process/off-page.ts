import type { DataRecord, SymbolDef } from '@pipeline-view/core';
import { PIPING, esc, group, part } from '../shared';

/** Data bound by off-page connectors: a short tag such as "GAS", "N2" or a drawing reference. */
export interface OffPageData extends DataRecord {
  text?: string;
}

const ARROW = /* @__PURE__ */ part({ d: 'M1 1H74L95 18L74 35H1Z', fill: 'bg' });

function draw(text: unknown): string {
  const t = text === undefined || text === '' ? '' : esc(text);
  return group(
    ARROW +
      (t &&
        `<text x="40" y="22.5" text-anchor="middle" fill="currentColor" stroke="none" ` +
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
    size: { width: 96, height: 36 },
    ports: [
      inlet
        ? { id: 'out', position: { x: 95, y: 18 }, direction: 'right', role: 'out' }
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
