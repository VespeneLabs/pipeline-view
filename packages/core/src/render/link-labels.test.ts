import { describe, expect, it } from 'vitest';
import type { Point, Rect } from '../model/types';
import { LinkLabelLayout, type LinkLabelSpec } from './link-labels';

const size = { width: 40, height: 20 };
const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const none = () => [];

/** Three links from the left that turn down into one target: vertical runs 6 apart, like router lanes. */
const converging = (): Record<string, LinkLabelSpec> => ({
  a: { size, route: [{ x: 0, y: 0 }, { x: 294, y: 0 }, { x: 294, y: 300 }] }, // prettier-ignore
  b: { size, route: [{ x: 0, y: 40 }, { x: 300, y: 40 }, { x: 300, y: 300 }] }, // prettier-ignore
  c: { size, route: [{ x: 0, y: 80 }, { x: 306, y: 80 }, { x: 306, y: 300 }] }, // prettier-ignore
});

function layoutOf(specs: Record<string, LinkLabelSpec>, order = Object.keys(specs)) {
  const layout = new LinkLabelLayout();
  for (const id of order) layout.set(id, specs[id]!);
  layout.update(none);
  return layout;
}
const boxesOf = (layout: LinkLabelLayout, ids: string[]) => ids.map((id) => layout.box(id));

describe('LinkLabelLayout', () => {
  it('keeps the labels of links that converge on one target from overlapping', () => {
    const layout = layoutOf(converging());
    const [a, b, c] = boxesOf(layout, ['a', 'b', 'c']) as Rect[];
    // Without avoidance all three would sit on the middle of their horizontal runs, which is fine,
    // so force the conflict: prefer the same height on the shared vertical corridor.
    expect(overlap(a!, b!) || overlap(a!, c!) || overlap(b!, c!)).toBe(false);

    const specs = converging();
    for (const s of Object.values(specs)) s.position = 0.75;
    const stacked = layoutOf(specs);
    const bs = boxesOf(stacked, ['a', 'b', 'c']) as Rect[];
    // 'a' keeps its preferred spot; the others slid along their own paths.
    expect(stacked.point('a')).toEqual({ x: 294, y: 151.5 });
    expect(stacked.point('b')!.x).toBe(300);
    expect(stacked.point('c')!.x).toBe(306);
    for (let i = 0; i < 3; i++)
      for (let j = i + 1; j < 3; j++) expect(overlap(bs[i]!, bs[j]!)).toBe(false);
  });

  it('honours labelPosition when the spot is free', () => {
    const layout = new LinkLabelLayout();
    layout.set('a', { size, route: [{ x: 0, y: 0 }, { x: 200, y: 0 }], position: 0.25 }); // prettier-ignore
    layout.set('b', { size, route: [{ x: 0, y: 100 }, { x: 200, y: 100 }], position: 0.25 }); // prettier-ignore
    expect(layout.update(none).sort()).toEqual(['a', 'b']);
    expect(layout.point('a')).toEqual({ x: 50, y: 0 });
    expect(layout.point('b')).toEqual({ x: 50, y: 100 });
  });

  it('does not depend on the order links were added', () => {
    const specs = converging();
    for (const s of Object.values(specs)) s.position = 0.75;
    const ids = ['a', 'b', 'c'];
    const expected = boxesOf(layoutOf(specs), ids);
    for (const order of [
      ['c', 'b', 'a'],
      ['b', 'c', 'a'],
      ['c', 'a', 'b'],
    ])
      // prettier-ignore
      expect(boxesOf(layoutOf(specs, order), ids)).toEqual(expected);
  });

  it('avoids nodes, and re-places only the labels near a node that moved', () => {
    const layout = new LinkLabelLayout();
    layout.set('a', { size, route: [{ x: 0, y: 0 }, { x: 200, y: 0 }] }); // prettier-ignore
    layout.set('z', { size, route: [{ x: 0, y: 500 }, { x: 200, y: 500 }] }); // prettier-ignore
    let node: Rect = { x: 80, y: -10, width: 40, height: 20 };
    let asked = 0;
    const nodes = (region: Rect) => {
      asked++;
      return overlap(node, region) ? [node] : [];
    };
    layout.update(nodes);
    expect(overlap(layout.box('a')!, node)).toBe(false);
    expect(layout.point('z')).toEqual({ x: 100, y: 500 });

    // The node leaves: 'a' goes back to the middle; 'z', far away, is not even looked at.
    asked = 0;
    layout.touch(node);
    node = { x: 80, y: 200, width: 40, height: 20 };
    layout.touch(node);
    expect(layout.update(nodes)).toEqual(['a']);
    expect(asked).toBe(1);
    expect(layout.point('a')).toEqual({ x: 100, y: 0 });
    // Nothing changed: nothing to do.
    expect(layout.update(nodes)).toEqual([]);
    expect(asked).toBe(1);
  });

  it('re-places neighbours when a label moves or goes away', () => {
    const specs = converging();
    for (const s of Object.values(specs)) s.position = 0.75;
    const layout = layoutOf(specs);
    const pushed = layout.point('b')!;
    expect(pushed).not.toEqual({ x: 300, y: 160 });
    // 'a' is removed: 'b' takes its preferred spot, and 'c' follows what 'b' did.
    layout.set('a', null);
    expect(layout.update(none)).toContain('b');
    expect(layout.point('b')).toEqual({ x: 300, y: 160 });
    expect(layout.box('a')).toBeNull();
    expect(overlap(layout.box('b')!, layout.box('c')!)).toBe(false);
  });

  it('matches a from-scratch layout after arbitrary route, node and label changes', () => {
    let seed = 11;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    const route = (): Point[] => {
      const x = rnd(40) * 10;
      const y = rnd(40) * 10;
      const x2 = 150 + rnd(8) * 6;
      return [{ x, y }, { x: x2, y }, { x: x2, y: 400 }, { x: 200, y: 400 }]; // prettier-ignore
    };
    const specs = new Map<string, LinkLabelSpec>();
    const nodes = new Map<number, Rect>();
    const obstacles = (region: Rect) => [...nodes.values()].filter((r) => overlap(r, region));
    const live = new LinkLabelLayout();
    for (let step = 0; step < 300; step++) {
      const id = 'l' + rnd(25);
      const kind = rnd(6);
      if (kind === 0) {
        specs.delete(id);
        live.set(id, null);
      } else if (kind === 1) {
        const k = rnd(6);
        const prev = nodes.get(k);
        if (prev) live.touch(prev);
        const rect = { x: rnd(40) * 10, y: rnd(40) * 10, width: 40, height: 30 };
        nodes.set(k, rect);
        live.touch(rect);
      } else {
        const spec: LinkLabelSpec = {
          size: { width: 20 + rnd(6) * 7, height: 20 },
          route: route(),
          position: rnd(3) ? undefined : rnd(11) / 10,
        };
        specs.set(id, spec);
        live.set(id, spec);
      }
      live.update(obstacles);
      const fresh = new LinkLabelLayout();
      for (const [k, s] of specs) fresh.set(k, s);
      fresh.update(obstacles);
      for (const k of specs.keys()) expect(live.box(k), `step ${step} ${k}`).toEqual(fresh.box(k));
    }
  });

  it('places 1,000 labels among 500 nodes quickly, and a local change far quicker', () => {
    const layout = new LinkLabelLayout();
    const nodes: Rect[] = [];
    for (let i = 0; i < 500; i++)
      nodes.push({ x: (i % 25) * 160, y: Math.floor(i / 25) * 120, width: 60, height: 40 });
    const obstacles = (region: Rect) => nodes.filter((r) => overlap(r, region));
    const spec = (i: number, dx = 0): LinkLabelSpec => {
      const x = (i % 25) * 160 + 60 + dx;
      const y = Math.floor((i % 500) / 25) * 120 + 20;
      return { size, route: [{ x, y }, { x: x + 50, y }, { x: x + 50, y: y + 120 }, { x: x + 100, y: y + 120 }] }; // prettier-ignore
    };
    for (let i = 0; i < 1000; i++) layout.set('l' + i, spec(i));
    const t0 = performance.now();
    layout.update(obstacles);
    const full = performance.now() - t0;
    const times: number[] = [];
    for (let step = 1; step <= 20; step++) {
      // A drag frame: one node moves and three links get new routes.
      for (const i of [10, 510, 11]) layout.set('l' + i, spec(i, step));
      const t1 = performance.now();
      layout.update(obstacles);
      times.push(performance.now() - t1);
    }
    times.sort((a, b) => a - b);
    console.info(`labels: full ${full.toFixed(1)} ms, drag frame ${times[10]!.toFixed(2)} ms`);
    expect(full).toBeLessThan(500);
    // Well inside the 16 ms drag budget (NFR-1), with room for slow CI machines.
    expect(times[10]!).toBeLessThan(4);
  });
});
