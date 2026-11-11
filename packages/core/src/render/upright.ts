/**
 * Keeps text drawn inside a symbol readable when its node is rotated or flipped: every `<text>` gets a
 * transform that undoes the node's rotation and mirroring around the text's own centre, so the letters
 * stay upright and in the same place inside the shape while the linework turns. Stacked lines (the tag
 * letters and loop number of an instrument bubble) are treated as one block, so they keep their order.
 *
 * No layout is read: centres are estimated from the x/y attributes, the anchor and the font size.
 */
import type { NodeModel, Point } from '../model/types';

/** Cap-height centre above the baseline, as a fraction of the font size. */
const BASELINE_TO_CENTRE = 0.34;
/** Estimated advance per character, as a fraction of the font size (only for start/end anchored text). */
const CHAR_ADVANCE = 0.6;
/** Lines closer than this many font sizes, with the same centre x, are one block. */
const LINE_REACH = 2.5;
const DEFAULT_FONT_SIZE = 14;

/** '' when the node needs no counter-transform, else a key that changes with its orientation. */
export function orientationKey(n: NodeModel): string {
  const r = n.rotation ?? 0;
  return r || n.flipX || n.flipY ? `${r}|${n.flipX ? 1 : 0}|${n.flipY ? 1 : 0}` : '';
}

interface Line {
  el: Element;
  centre: Point;
  size: number;
}

function fontSize(el: Element): number {
  const attr = parseFloat(el.getAttribute('font-size') ?? '');
  if (attr > 0) return attr;
  const m = /(\d*\.?\d+)px/.exec(el.getAttribute('style') ?? '');
  return m ? parseFloat(m[1]!) : DEFAULT_FONT_SIZE;
}

function measure(el: Element): Line {
  const size = fontSize(el);
  const x = parseFloat(el.getAttribute('x') ?? '') || 0;
  const y = parseFloat(el.getAttribute('y') ?? '') || 0;
  const style = el.getAttribute('style') ?? '';
  const anchor = el.getAttribute('text-anchor') ?? /text-anchor:\s*(\w+)/.exec(style)?.[1];
  const half = ((el.textContent ?? '').length * size * CHAR_ADVANCE) / 2;
  const baseline =
    el.getAttribute('dominant-baseline') ?? /dominant-baseline:\s*([\w-]+)/.exec(style)?.[1];
  return {
    el,
    centre: {
      x: anchor === 'middle' ? x : anchor === 'end' ? x - half : x + half,
      y: baseline === 'middle' || baseline === 'central' ? y : y - size * BASELINE_TO_CENTRE,
    },
    size,
  };
}

/** Groups stacked lines: same centre x, and each within reach of the line above it. */
function blocks(lines: Line[]): Line[][] {
  const sorted = [...lines].sort((a, b) => a.centre.y - b.centre.y);
  const out: Line[][] = [];
  for (const line of sorted) {
    const home = out.find((b) => {
      const last = b[b.length - 1]!;
      return (
        Math.abs(last.centre.x - line.centre.x) < 0.5 &&
        line.centre.y - last.centre.y <= LINE_REACH * Math.max(last.size, line.size)
      );
    });
    if (home) home.push(line);
    else out.push([line]);
  }
  return out;
}

const round = (v: number) => Math.round(v * 100) / 100;

/**
 * Sets the counter-transform on every `<text>` under `root` (a symbol's freshly written markup) for a
 * node with the given orientation. A text's own `transform` attribute is kept and applied first.
 */
export function uprightTexts(root: Element, n: NodeModel): void {
  const texts = root.querySelectorAll('text');
  if (!texts.length) return;
  const r = n.rotation ?? 0;
  const undo = `scale(${n.flipX ? -1 : 1},${n.flipY ? -1 : 1})${r ? ` rotate(${-r})` : ''}`;
  for (const block of blocks([...texts].map(measure))) {
    const first = block[0]!;
    const last = block[block.length - 1]!;
    const cx = round(first.centre.x);
    const cy = round((first.centre.y + last.centre.y) / 2);
    const t = `translate(${cx},${cy}) ${undo} translate(${-cx},${-cy})`;
    for (const { el } of block) {
      const own = el.getAttribute('transform');
      el.setAttribute('transform', own ? `${t} ${own}` : t);
    }
  }
}
