import { describe, expect, it } from 'vitest';
import { arrowsPath, linkLabelPoint, linkPath, ticksPath } from './paths';

describe('linkPath', () => {
  const h = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ];

  it('draws a plain polyline', () => {
    expect(linkPath([...h, { x: 100, y: 50 }])).toBe('M0 0L100 0L100 50');
  });

  it('hops over crossings on horizontal segments, always bulging up', () => {
    expect(linkPath(h, [{ x: 50, y: 0 }], 8)).toBe('M0 0L42 0A8 8 0 0 1 58 0L100 0');
    // Travelling left, sweep flips so the bulge still points up.
    expect(linkPath([...h].reverse(), [{ x: 50, y: 0 }], 8)).toBe('M100 0L58 0A8 8 0 0 0 42 0L0 0');
  });

  it('hops on vertical segments, bulging left in both travel directions', () => {
    const v = [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
    ];
    expect(linkPath(v, [{ x: 0, y: 50 }], 8)).toBe('M0 0L0 42A8 8 0 0 0 0 58L0 100');
    expect(linkPath([...v].reverse(), [{ x: 0, y: 50 }], 8)).toBe('M0 100L0 58A8 8 0 0 1 0 42L0 0');
  });

  it('ignores crossings too close to a corner, off the segment, or overlapping', () => {
    expect(
      linkPath(
        h,
        [
          { x: 4, y: 0 },
          { x: 50, y: 30 },
        ],
        8,
      ),
    ).toBe('M0 0L100 0');
    expect(
      linkPath(
        h,
        [
          { x: 50, y: 0 },
          { x: 55, y: 0 },
        ],
        8,
      ),
    ).toBe('M0 0L42 0A8 8 0 0 1 58 0L100 0');
  });
});

describe('arrowsPath', () => {
  it('puts one chevron mid-segment pointing along the flow, skipping short segments', () => {
    const d = arrowsPath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 20 },
      ],
      10,
    );
    expect(d).toBe('M45 3L55 0L45 -3');
  });
});

describe('ticksPath', () => {
  it('draws one centered pair of slanted ticks per period, like reference #50', () => {
    const d = ticksPath(
      [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
      ],
      40,
    );
    expect(d).toBe('M12.5 8L20.5 -8M19.5 8L27.5 -8');
  });

  it('skips segments shorter than one period', () => {
    expect(
      ticksPath(
        [
          { x: 0, y: 0 },
          { x: 30, y: 0 },
        ],
        40,
      ),
    ).toBe('');
  });
});

describe('linkLabelPoint', () => {
  const size = { width: 30, height: 20 };
  // Right 100, down 300, right 100: the vertical run is the longest segment.
  const path = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 300 },
    { x: 200, y: 300 },
  ];

  it('defaults to the middle of the longest segment', () => {
    expect(linkLabelPoint(path, size)).toEqual({ x: 100, y: 150 });
  });

  it('skips segments whose label box would overlap a node', () => {
    const node = { x: 80, y: 130, width: 60, height: 40 };
    expect(linkLabelPoint(path, size, [node])).toEqual({ x: 50, y: 0 });
  });

  it('moves beside a segment when no centred spot is clear', () => {
    // Nodes hug both sides of the horizontal runs and the vertical run's centre; left of it is free.
    const avoid = [
      { x: -20, y: -15, width: 140, height: 30 },
      { x: 98, y: 100, width: 4, height: 100 },
      { x: 90, y: 285, width: 120, height: 30 },
    ];
    expect(linkLabelPoint(path, size, avoid)).toEqual({ x: 81, y: 150 });
  });

  it('falls back to the longest segment when nothing is clear', () => {
    const everything = { x: -50, y: -50, width: 400, height: 400 };
    expect(linkLabelPoint(path, size, [everything])).toEqual({ x: 100, y: 150 });
  });

  it('places by fraction of the path length with labelPosition, clamped to 0..1', () => {
    expect(linkLabelPoint(path, size, [], 0)).toEqual({ x: 0, y: 0 });
    expect(linkLabelPoint(path, size, [], 0.5)).toEqual({ x: 100, y: 150 });
    expect(linkLabelPoint(path, size, [], 0.1)).toEqual({ x: 50, y: 0 });
    expect(linkLabelPoint(path, size, [], 7)).toEqual({ x: 200, y: 300 });
  });

  it('returns null without a path', () => {
    expect(linkLabelPoint([{ x: 1, y: 1 }], size)).toBeNull();
  });
});
